import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbTenantContext, resellerTenantContext } from "@/lib/checkout/free-enrollment"
import { createBoletoInstallmentPlan } from "@/lib/installments/plan"
import { installmentAmountsError } from "@/lib/installments/schedule"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { registerExternalFirstPayment } from "@/lib/enrollment/external-first-payment-server"
import { brDayIso } from "@/lib/dates"
import { decryptTenantAsaasKey, deleteInstallment, motherAsaasKey } from "@/lib/asaas/client"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * Transforma UMA matrícula liberada sem cobrança (ex.: desconto de 100% dado
 * para destravar quem pagou a 1ª mensalidade num marketplace) num carnê de
 * boletos no Asaas, opcionalmente registrando a 1ª mensalidade como paga fora.
 *
 * O acesso NÃO é mexido: a matrícula segue ACTIVE e os boletos entram como as
 * parcelas seguintes. A cota de aulas passa a valer pelo carnê.
 *
 * Params: `enrollment`, `boletos` (nº de boletos a gerar), `valor` (de cada),
 * `vencimento` (1º boleto, YYYY-MM-DD; os demais mês a mês), `pagaForaEm`
 * (opcional, YYYY-MM-DD: a 1ª mensalidade paga fora vira a parcela 1).
 *
 * Auth: Bearer CRON_SECRET. Dry-run por padrão; `apply=1` executa. Disparo:
 * `app_internal.run_cron('/api/cron/carne-matricula-liberada?enrollment=<id>&...')`.
 */
export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const q = new URL(request.url).searchParams
  const id = q.get("enrollment") ?? ""
  const boletos = Number(q.get("boletos"))
  const valor = Number(q.get("valor"))
  const vencimento = q.get("vencimento") ?? ""
  const pagaForaEm = q.get("pagaForaEm")
  const apply = q.get("apply") === "1"
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  const today = brDayIso(new Date())

  if (!id || !Number.isInteger(boletos) || boletos < 1 || boletos > 24 || !ymd.test(vencimento)) {
    return NextResponse.json(
      { error: "Informe enrollment, boletos (1..24), valor e vencimento=YYYY-MM-DD" },
      { status: 400 },
    )
  }
  const amountsError = installmentAmountsError(Array(boletos).fill(valor), boletos)
  if (amountsError) return NextResponse.json({ error: amountsError }, { status: 400 })
  if (vencimento < today) {
    return NextResponse.json({ error: "O 1º vencimento não pode estar no passado" }, { status: 400 })
  }
  if (pagaForaEm && (!ymd.test(pagaForaEm) || pagaForaEm > today)) {
    return NextResponse.json({ error: "pagaForaEm inválida ou futura" }, { status: 400 })
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      tenantId: true,
      paymentType: true,
      gateway: true,
      finalAmount: true,
      originalAmount: true,
      discountAmount: true,
      installmentsTotal: true,
      installmentsPaid: true,
      asaasInstallmentId: true,
      asaasSubscriptionId: true,
      studentId: true,
      student: { select: { nome: true, cpf: true, bolsista: true } },
      course: { select: { nome: true } },
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          plataformaVendedorId: true,
          salesGateway: true,
          asaasApiKey: true,
        },
      },
      _count: { select: { payments: true, boletoInstallments: true } },
    },
  })
  if (!enrollment) return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })

  // Só matrícula liberada SEM cobrança nenhuma: qualquer pagamento, carnê ou
  // assinatura existente significa que já há algo cobrando — converter por
  // cima cobraria em dobro.
  const problemas = [
    enrollment.status !== "ACTIVE" && `status ${enrollment.status}`,
    Number(enrollment.finalAmount) !== 0 && "matrícula tem valor cobrado",
    enrollment._count.payments > 0 && "matrícula já tem pagamento",
    enrollment._count.boletoInstallments > 0 && "matrícula já tem carnê",
    (enrollment.asaasInstallmentId || enrollment.asaasSubscriptionId) && "cobrança viva no Asaas",
    enrollment.tenant && enrollment.tenant.salesGateway !== "ASAAS" && "unidade não vende pelo Asaas",
    !enrollment.student.cpf && "aluno sem CPF",
  ].filter(Boolean)
  if (problemas.length) {
    return NextResponse.json({ error: "Matrícula não elegível", problemas }, { status: 409 })
  }

  const total = boletos + (pagaForaEm ? 1 : 0)
  const totalAmount = Math.round(total * valor * 100) / 100
  const plano = {
    aluno: enrollment.student.nome,
    curso: enrollment.course.nome,
    conta: enrollment.tenant ? enrollment.tenant.slug : "PMB (conta-mãe)",
    mensalidades: total,
    pagaForaEm,
    boletos,
    valor,
    vencimentos: Array.from({ length: boletos }, (_, i) => {
      const d = new Date(`${vencimento}T12:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + i)
      return d.toISOString().slice(0, 10)
    }),
    totalAmount,
  }
  if (!apply) return NextResponse.json({ data: { apply, plano } })

  const before = {
    paymentType: enrollment.paymentType,
    gateway: enrollment.gateway,
    originalAmount: enrollment.originalAmount,
    discountAmount: enrollment.discountAmount,
    finalAmount: enrollment.finalAmount,
    installmentsTotal: enrollment.installmentsTotal,
    installmentsPaid: enrollment.installmentsPaid,
  }
  await prisma.enrollment.update({
    where: { id },
    data: {
      paymentType: "BOLETO_INSTALLMENT",
      gateway: "ASAAS",
      originalAmount: totalAmount,
      discountAmount: 0,
      finalAmount: totalAmount,
      installmentsTotal: total,
      installmentsPaid: 0,
    },
  })

  const paidAt = pagaForaEm ? new Date(`${pagaForaEm}T12:00:00Z`) : null
  try {
    await createBoletoInstallmentPlan({
      enrollmentId: id,
      count: boletos,
      installmentValue: valor,
      firstDueDate: new Date(`${vencimento}T12:00:00Z`),
      ...(paidAt ? { paidBefore: { paidAt, amount: valor } } : {}),
    })
  } catch (err) {
    // Devolve a matrícula como estava. Se o carnê chegou a nascer no Asaas, ele
    // é removido — senão o aluno receberia boletos de uma venda desfeita.
    const orphan = await prisma.enrollment.findUnique({
      where: { id },
      select: { asaasInstallmentId: true },
    })
    if (orphan?.asaasInstallmentId) {
      const key = enrollment.tenant?.asaasApiKey
        ? decryptTenantAsaasKey(enrollment.tenant.asaasApiKey)
        : motherAsaasKey()
      await deleteInstallment(orphan.asaasInstallmentId, key).catch((e) =>
        contextLogger().error(
          { err: e, event: "cron.carne_matricula_liberada.orphan", installmentId: orphan.asaasInstallmentId },
          "carnê órfão não removido do Asaas",
        ),
      )
    }
    await prisma.boletoInstallment.deleteMany({ where: { enrollmentId: id } })
    await prisma.enrollment.update({ where: { id }, data: { ...before, asaasInstallmentId: null } })
    const erro = err instanceof Error ? err.message : String(err)
    contextLogger().error({ err, event: "cron.carne_matricula_liberada.failed", enrollmentId: id }, "carnê falhou")
    return NextResponse.json({ data: { apply, plano, ok: false, erro } }, { status: 502 })
  }

  if (paidAt) {
    const tenantCtx = enrollment.tenant
      ? resellerTenantContext(enrollment.tenant)
      : pmbTenantContext(await getOrCreatePmbTenant())
    await registerExternalFirstPayment({
      tenant: tenantCtx,
      enrollmentId: id,
      gateway: "ASAAS",
      paymentType: "BOLETO_INSTALLMENT",
      amount: valor,
      paidAt,
    })
  }
  // Quem paga carnê não é bolsista (a bolsa era só o atalho para liberar).
  if (enrollment.student.bolsista) {
    await prisma.student.update({ where: { id: enrollment.studentId }, data: { bolsista: false } })
  }
  await evaluatePaceGate(id)

  await logAudit({
    action: "enrollment.carne_from_free",
    resource: "Enrollment",
    resourceId: id,
    actorRole: "SYSTEM",
    actorEmail: "cron:carne-matricula-liberada",
    tenantId: enrollment.tenantId,
    payloadBefore: before,
    payloadAfter: plano,
  })

  const parcelas = await prisma.boletoInstallment.findMany({
    where: { enrollmentId: id },
    orderBy: { number: "asc" },
    select: { number: true, amount: true, dueDate: true, status: true, asaasPaymentId: true },
  })
  return NextResponse.json({ data: { apply, plano, ok: true, parcelas } })
}

export async function GET(request: Request) {
  return POST(request)
}
