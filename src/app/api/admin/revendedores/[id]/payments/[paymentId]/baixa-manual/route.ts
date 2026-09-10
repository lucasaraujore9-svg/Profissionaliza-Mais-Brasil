import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { deletePayment, AsaasApiError } from "@/lib/asaas/client"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { resolverCompetencia } from "@/lib/asaas/competencia"
import { existeNoGateway } from "@/lib/tenant-billing/manual-payment"

const bodySchema = z.object({
  /** Quando a unidade pagou (AAAA-MM-DD). Ausente = hoje. */
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
})

/**
 * BAIXA MANUAL DE UMA FATURA — a unidade pagou por fora e a cobranca morre.
 *
 * Diferente do lancamento avulso (`/pagamento-manual`, que cria linhas para
 * meses que ainda nem foram gerados), aqui existe uma fatura de verdade —
 * vencida ou a vencer — e ela e quitada.
 *
 * A COBRANCA E CANCELADA NO ASAAS, e isso nao e detalhe: mantida viva ela
 * continua cobravel (a unidade pode pagar DUAS vezes), vence, dispara lembrete e
 * acaba suspendendo quem ja tinha pago.
 *
 * ORDEM: grava a baixa PRIMEIRO, cancela depois. `paidAt`/`markedPaidAt` sao a
 * prova que faz o handler de `PAYMENT_DELETED` IGNORAR a cobranca em vez de
 * marca-la DELETED (ver src/lib/asaas/process.ts). Cancelando antes, o webhook
 * poderia chegar com a linha ainda sem prova e apagar do extrato uma mensalidade
 * que a unidade pagou.
 *
 * Falha no cancelamento NAO desfaz a baixa: o dinheiro entrou, e esse fato vale
 * mais do que o estado da cobranca no gateway. A resposta devolve
 * `asaasCancelFailed` para a tela dizer que a cobranca precisa ser cancelada a
 * mao — em vez de fingir que deu tudo certo.
 */
export const POST = withRequestContextParams<{ id: string; paymentId: string }>(
  {
    action: "admin.revendedores.payments.baixa_manual",
    route: "/api/admin/revendedores/[id]/payments/[paymentId]/baixa-manual",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("financeiro.manage")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx
    const { id, paymentId } = await context.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      payload = {}
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        accountManagerId: true,
        salesUserId: true,
      },
    })
    if (!tenant || !(await ctx.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const payment = await prisma.tenantPayment.findFirst({
      // `tenantId` no where impede quitar a fatura de OUTRA unidade passando um
      // paymentId qualquer na URL.
      where: { id: paymentId, tenantId: id },
      select: {
        id: true,
        asaasPaymentId: true,
        status: true,
        amount: true,
        dueDate: true,
        paidAt: true,
        markedPaidAt: true,
        notes: true,
      },
    })
    if (!payment) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }
    if (payment.paidAt || payment.markedPaidAt) {
      return NextResponse.json(
        { error: "Esta cobrança já está paga.", code: "ALREADY_PAID" },
        { status: 409 },
      )
    }
    if (!["PENDING", "OVERDUE"].includes(payment.status)) {
      return NextResponse.json(
        {
          error: "Só é possível dar baixa numa cobrança em aberto ou vencida.",
          code: "NOT_OPEN",
        },
        { status: 409 },
      )
    }

    const agora = new Date()
    const pagoEm = parsed.data.paidAt
      ? new Date(`${parsed.data.paidAt}T00:00:00.000Z`)
      : agora
    if (Number.isNaN(pagoEm.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 })
    }

    const autor = ctx.name ?? ctx.email ?? "Admin"
    const nota = parsed.data.note?.trim()
    const entrada = `[${agora.toLocaleString("pt-BR")}] ${autor}: Baixa manual — recebido fora da plataforma.${nota ? ` ${nota}` : ""}`

    // 1) A BAIXA PRIMEIRO. Ver o bloco de doc acima: e o que protege a linha do
    // webhook de cancelamento que vem a seguir.
    const atualizado = await prisma.tenantPayment.updateMany({
      // CAS: so quita o que ainda esta em aberto — dois cliques nao viram duas
      // baixas nem duas tentativas de cancelamento.
      where: { id: paymentId, tenantId: id, paidAt: null, markedPaidAt: null },
      data: {
        status: "RECEIVED",
        paidAt: pagoEm,
        clientPaidAt: pagoEm,
        // A competencia e a da FATURA quando ela foi paga em dia ou adiantada, e
        // a do pagamento quando atrasou — a mesma regra do resto do sistema.
        competenceAt: resolverCompetencia(payment.dueDate, pagoEm),
        markedPaidAt: agora,
        markedPaidById: ctx.userId,
        notes: payment.notes ? `${payment.notes}\n---\n${entrada}` : entrada,
      },
    })
    if (atualizado.count === 0) {
      return NextResponse.json(
        { error: "Esta cobrança já está paga.", code: "ALREADY_PAID" },
        { status: 409 },
      )
    }

    // 2) A COBRANCA MORRE NO ASAAS. Mantida viva ela seria cobrada de novo.
    let asaasCancelFailed: string | null = null
    if (existeNoGateway(payment.asaasPaymentId)) {
      try {
        await deletePayment(payment.asaasPaymentId)
      } catch (error: unknown) {
        // 404 = ja nao existe la. E o estado desejado, nao um erro.
        if (!(error instanceof AsaasApiError && error.statusCode === 404)) {
          asaasCancelFailed =
            error instanceof AsaasApiError
              ? error.message
              : "Falha ao cancelar a cobrança no Asaas"
          contextLogger().error(
            { err: error, event: "admin.baixa_manual.asaas_cancel_failed", paymentId },
            "baixa manual gravada, mas a cobranca segue viva no Asaas",
          )
        }
      }
    }

    await logAudit({
      action: "tenant_payment.manual_settle",
      resource: "tenant_payment",
      resourceId: paymentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      tenantId: id,
      payloadBefore: { status: payment.status },
      payloadAfter: {
        unidade: tenant.name,
        valor: Number(payment.amount),
        vencimento: payment.dueDate.toISOString().slice(0, 10),
        pagoEm: pagoEm.toISOString().slice(0, 10),
        origem: "fatura_existente",
        cobrancaCanceladaNoAsaas: asaasCancelFailed === null,
        nota: nota ?? null,
      },
    }).catch(swallow("admin.revendedores.payments.baixa_manual"))

    // A baixa manual tira a unidade de "nunca pagou" sem dinheiro passar por
    // gateway — mesmo cuidado do `mark-paid`. SEM `category` para nao poder ser
    // silenciado por preferencia.
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: `Baixa manual de mensalidade: ${tenant.name}`,
      body: `Fatura de R$ ${Number(payment.amount).toFixed(2).replace(".", ",")} (venc. ${payment.dueDate.toLocaleDateString("pt-BR")}) recebida fora da plataforma, por ${autor}.${asaasCancelFailed ? " ATENÇÃO: a cobrança NÃO pôde ser cancelada no Asaas." : ""}`,
      href: `/admin/revendedores/${id}`,
    }).catch(swallow("admin.revendedores.payments.baixa_manual"))

    return NextResponse.json({
      data: {
        paidAt: pagoEm.toISOString(),
        competenceAt: resolverCompetencia(payment.dueDate, pagoEm).toISOString(),
        asaasCancelFailed,
      },
    })
  },
)
