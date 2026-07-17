/**
 * Criação e emissão do carnê (venda parcelada no boleto) da venda direta.
 *
 * Roteia pelo `salesGateway` da unidade:
 *   - ASAAS: cria o parcelamento nativo (POST /installments) — o Asaas gera as N
 *     cobranças de uma vez, com vencimentos mensais. Persistimos uma parcela por
 *     cobrança (asaasPaymentId + invoiceUrl + vencimento).
 *   - MP: criamos as N linhas SCHEDULED e emitimos SÓ a 1ª agora (entrada que
 *     libera o acesso). As demais o cron `sweep-boleto-installments` emite ~7
 *     dias antes de cada vencimento (o MP não tem carnê nativo).
 *
 * O provisionamento do acesso e a contagem de parcelas pagas ficam a cargo de
 * `fulfillEnrollment` (reusa o fluxo de mensalidade): a 1ª parcela paga provisiona,
 * as demais só registram o Payment. Ver src/lib/installments/settle.ts.
 */
import type { BoletoInstallment } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { decryptTenantMpToken, createPayment as createMpPayment } from "@/lib/mercadopago/client"
import type { MPCreatePaymentParams } from "@/lib/mercadopago/types"
import {
  decryptTenantAsaasKey,
  findOrCreateAsaasCustomer,
  getCustomer as getAsaasCustomer,
  createInstallmentWithBoleto,
  getInstallmentPayments,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import { asaasWebhookUrl, mpWebhookUrl } from "@/lib/tenant/urls"
import {
  buildInstallmentSchedule,
  MP_BOLETO_METHOD_ID,
  type ScheduledInstallment,
} from "./schedule"

export interface CreatePlanInput {
  enrollmentId: string
  count: number
  installmentValue: number
  /** Vencimento da 1ª parcela. As demais são mensais a partir dela. */
  firstDueDate: Date
  /**
   * Total EXATO da venda (checkout self-service da PMB). Quando informado, vai
   * como `totalValue` ao Asaas, que reconcilia a última parcela — evita drift
   * de centavos (6×166,67 ≠ 1.000,00). Ausente = round(count × installmentValue)
   * (venda direta da revenda, onde o operador define o valor da parcela).
   */
  exactTotalValue?: number
  /** Descrição da cobrança no Asaas. Default: `Curso: ${nome do curso}`. */
  description?: string
}

export interface CreatePlanResult {
  installments: BoletoInstallment[]
  /** Link do boleto da 1ª parcela (para a revenda enviar ao aluno na hora). */
  firstBoletoUrl: string | null
}

/** Dados da matrícula/aluno/unidade necessários para emitir boletos. */
interface PlanContext {
  enrollment: {
    id: string
    tenantId: string | null
    externalReference: string | null
    courseNome: string
    student: {
      id: string
      nome: string
      email: string | null
      cpf: string | null
      fone: string | null
      cep: string | null
      rua: string | null
      numero: string | null
      bairro: string | null
      cidade: string | null
      estado: string | null
      asaasCustomerId: string | null
    }
  }
  /**
   * null = matrícula da vitrine PMB (tenantId=null): o carnê é emitido na
   * conta-mãe Asaas (motherAsaasKey), sempre gateway ASAAS. Não-nulo = venda
   * direta da revenda, na conta da própria unidade.
   */
  tenant: {
    id: string
    slug: string
    salesGateway: "MP" | "ASAAS"
    mpAccessToken: string | null
    asaasApiKey: string | null
  } | null
}

async function loadContext(enrollmentId: string): Promise<PlanContext> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      tenantId: true,
      externalReference: true,
      course: { select: { nome: true } },
      student: {
        select: {
          id: true,
          nome: true,
          email: true,
          cpf: true,
          fone: true,
          cep: true,
          rua: true,
          numero: true,
          bairro: true,
          cidade: true,
          estado: true,
          asaasCustomerId: true,
        },
      },
      tenant: {
        select: {
          id: true,
          slug: true,
          salesGateway: true,
          mpAccessToken: true,
          asaasApiKey: true,
        },
      },
    },
  })
  if (!enrollment) throw new Error(`enrollment ${enrollmentId} nao encontrado`)
  // enrollment.tenant === null → matrícula da vitrine PMB: carnê na conta-mãe
  // (ver createAsaasCarne). O caminho MP continua exclusivo da revenda — a
  // guarda fica em emitMpBoletoForRow/createMpInstallmentPlan.
  return {
    enrollment: {
      id: enrollment.id,
      tenantId: enrollment.tenantId,
      externalReference: enrollment.externalReference,
      courseNome: enrollment.course.nome,
      student: enrollment.student,
    },
    tenant: enrollment.tenant,
  }
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * date_of_expiration do boleto MP: fim do dia (UTC) do vencimento. Se o
 * vencimento já passou (catch-up do cron após dias pulados), o MP recusa uma
 * expiração no passado — empurramos para daqui a 3 dias para o aluno pagar em
 * atraso (a parcela segue marcada OVERDUE; isto é só a validade do boleto).
 */
function boletoExpirationIso(dueDate: Date): string {
  const now = Date.now()
  const base =
    dueDate.getTime() < now ? new Date(now + 3 * 24 * 60 * 60 * 1000) : new Date(dueDate)
  base.setUTCHours(23, 59, 59, 0)
  return base.toISOString()
}

function splitName(nome: string): { first: string; last: string } {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? "Aluno"
  const last = parts.slice(1).join(" ") || first
  return { first, last }
}

// ── Criação do plano ────────────────────────────────────────────────────────

export async function createBoletoInstallmentPlan(
  input: CreatePlanInput,
): Promise<CreatePlanResult> {
  const ctx = await loadContext(input.enrollmentId)

  // Asaas gera o carnê nativo (vencimentos definidos por ele); no MP montamos a
  // agenda e emitimos boleto a boleto. PMB (sem tenant) é sempre Asaas
  // conta-mãe — a rota de checkout só oferece carnê quando o gateway é ASAAS.
  if (!ctx.tenant || ctx.tenant.salesGateway === "ASAAS") {
    return createAsaasCarne(ctx, input)
  }
  const schedule = buildInstallmentSchedule({
    count: input.count,
    installmentValue: input.installmentValue,
    firstDueDate: input.firstDueDate,
  })
  return createMpInstallmentPlan(ctx, schedule)
}

// ── Asaas: carnê nativo ─────────────────────────────────────────────────────

/**
 * Resolve/cria o cliente na conta Asaas correta: da UNIDADE (venda direta) ou
 * conta-mãe (vitrine PMB). O externalReference segue a convenção de cada lado
 * (`student_<id>` vs `pmb_student_<id>`, mesma usada por issuePmbAsaasCharge).
 */
async function resolveAsaasCustomerId(
  ctx: PlanContext,
  apiKey: string,
  isPmb: boolean,
): Promise<string> {
  const s = ctx.enrollment.student
  if (s.asaasCustomerId) {
    try {
      const existing = await getAsaasCustomer(s.asaasCustomerId, apiKey)
      if (existing && !existing.deleted) return existing.id
    } catch (err) {
      if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
    }
  }
  const { customer } = await findOrCreateAsaasCustomer(
    {
      name: s.nome,
      email: s.email ?? undefined,
      cpfCnpj: s.cpf ?? "",
      mobilePhone: s.fone ?? undefined,
      postalCode: s.cep ?? undefined,
      addressNumber: s.numero ?? undefined,
      externalReference: isPmb ? `pmb_student_${s.id}` : `student_${s.id}`,
    },
    apiKey,
  )
  return customer.id
}

async function createAsaasCarne(
  ctx: PlanContext,
  input: CreatePlanInput,
): Promise<CreatePlanResult> {
  const isPmb = ctx.tenant === null
  if (!isPmb && !ctx.tenant?.asaasApiKey) {
    throw new Error("unidade sem conta Asaas conectada — não é possível gerar o carnê")
  }
  if (!ctx.enrollment.student.cpf) {
    throw new Error("CPF do aluno é obrigatório para gerar o carnê no Asaas")
  }
  // Hop do dinheiro: vitrine PMB cobra na conta-mãe; venda direta, na conta da
  // unidade. Chave sempre explícita.
  const apiKey = isPmb
    ? motherAsaasKey()
    : decryptTenantAsaasKey(ctx.tenant!.asaasApiKey!)
  const customerId = await resolveAsaasCustomerId(ctx, apiKey, isPmb)

  const totalValue =
    input.exactTotalValue ??
    Math.round(input.count * input.installmentValue * 100) / 100
  const installment = await createInstallmentWithBoleto(
    {
      installmentCount: input.count,
      customer: customerId,
      value: input.installmentValue,
      totalValue,
      billingType: "BOLETO",
      dueDate: ymd(input.firstDueDate),
      description: input.description ?? `Curso: ${ctx.enrollment.courseNome}`,
      // NÃO usa prefixo enr_ (o webhook Asaas casa enr_ com a matrícula direto —
      // aqui queremos o ramo de parcela, que casa por asaasPaymentId).
      paymentExternalReference: `carne_${ctx.enrollment.id}`,
      // Revenda: sem notificationUrl por cobrança — a unidade configura o webhook
      // DE CONTA (?tenant=<slug>) no painel Asaas. PMB: a conta-mãe roteia por
      // cobrança, então apontamos o webhook global explicitamente (mesma
      // convenção de issuePmbAsaasCharge).
      ...(isPmb ? { notificationUrl: asaasWebhookUrl() } : {}),
    },
    apiKey,
  )

  // Persiste o id do carnê IMEDIATAMENTE: se qualquer passo abaixo falhar, o
  // chamador consegue apagar o parcelamento no Asaas (deleteInstallment) em vez
  // de deixar um carnê órfão emitindo boletos para o comprador.
  await prisma.enrollment.update({
    where: { id: ctx.enrollment.id },
    data: { asaasInstallmentId: installment.id, asaasCustomerId: customerId },
  })

  // Lista as cobranças geradas (retry: o Asaas pode demorar um instante).
  let payments = [] as Awaited<ReturnType<typeof getInstallmentPayments>>["data"]
  for (let i = 0; i < 4; i++) {
    const list = await getInstallmentPayments(installment.id, apiKey).catch(() => null)
    if (list && list.data.length >= input.count) {
      payments = list.data
      break
    }
    if (list && list.data.length > 0) payments = list.data
    await new Promise((r) => setTimeout(r, 500))
  }

  if (payments.length === 0) {
    throw new Error(`carne ${installment.id} criado mas sem cobranças listadas`)
  }

  // Ordena por vencimento e numera 1..N.
  const ordered = [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  // Escritas SEQUENCIAIS (sem $transaction em lote — o pooler do Supabase derruba
  // o batch em prod). Se algo falhar, o chamador apaga a matrícula e o cascade
  // remove as parcelas já criadas.
  const rows: BoletoInstallment[] = []
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]
    rows.push(
      await prisma.boletoInstallment.create({
        data: {
          enrollmentId: ctx.enrollment.id,
          tenantId: ctx.enrollment.tenantId,
          number: i + 1,
          amount: p.value,
          dueDate: new Date(`${p.dueDate}T12:00:00Z`),
          status: "GENERATED",
          gateway: "ASAAS",
          invoiceUrl: p.bankSlipUrl ?? p.invoiceUrl,
          asaasPaymentId: p.id,
          generatedAt: new Date(),
        },
      }),
    )
  }
  await prisma.enrollment.update({
    where: { id: ctx.enrollment.id },
    data: {
      externalReference:
        ctx.enrollment.externalReference ?? `carne_${ctx.enrollment.id}`,
    },
  })

  return { installments: rows, firstBoletoUrl: rows[0]?.invoiceUrl ?? null }
}

// ── Mercado Pago: N boletos avulsos ─────────────────────────────────────────

async function createMpInstallmentPlan(
  ctx: PlanContext,
  schedule: ScheduledInstallment[],
): Promise<CreatePlanResult> {
  if (!ctx.tenant) {
    // Vitrine PMB nunca chega aqui (roteada para o carnê Asaas acima).
    throw new Error("carnê MP exige tenant (revenda) — matrícula é da vitrine PMB")
  }
  if (!ctx.tenant.mpAccessToken) {
    throw new Error("unidade sem Mercado Pago conectado — não é possível gerar o carnê")
  }

  // Cria as N linhas SCHEDULED — escritas SEQUENCIAIS (sem $transaction em lote:
  // o pooler do Supabase derruba o batch em prod). Em falha, o chamador apaga a
  // matrícula e o cascade remove as parcelas já criadas.
  const rows: BoletoInstallment[] = []
  for (const s of schedule) {
    rows.push(
      await prisma.boletoInstallment.create({
        data: {
          enrollmentId: ctx.enrollment.id,
          tenantId: ctx.enrollment.tenantId,
          number: s.number,
          amount: s.amount,
          dueDate: s.dueDate,
          status: "SCHEDULED",
          gateway: "MP",
        },
      }),
    )
  }

  // Emite SÓ a 1ª parcela agora (entrada). As demais ficam para o cron.
  const first = rows[0]
  const emitted = await emitMpBoletoForRow(first, ctx)
  return { installments: rows, firstBoletoUrl: emitted.invoiceUrl }
}

/**
 * Emite um boleto MP para UMA parcela SCHEDULED e atualiza a linha para GENERATED.
 * Idempotente via X-Idempotency-Key = parc_<id> (o MP devolve o mesmo pagamento).
 * Exige o endereço do aluno (o MP exige endereço do pagador no boleto).
 */
async function emitMpBoletoForRow(
  row: BoletoInstallment,
  ctx: PlanContext,
): Promise<BoletoInstallment> {
  if (!ctx.tenant) {
    throw new Error("boleto MP de parcela exige tenant (revenda) — matrícula é da vitrine PMB")
  }
  const s = ctx.enrollment.student
  if (!s.email) throw new Error(`aluno ${s.id} sem email — boleto MP exige email`)
  if (!s.cpf) throw new Error(`aluno ${s.id} sem CPF — boleto MP exige CPF`)
  if (!s.cep || !s.rua || !s.numero || !s.bairro || !s.cidade || !s.estado) {
    throw new Error(
      `aluno ${s.id} sem endereço completo — boleto MP exige CEP/logradouro/número/bairro/cidade/UF`,
    )
  }

  const accessToken = decryptTenantMpToken(ctx.tenant.mpAccessToken!)
  const { first, last } = splitName(s.nome)
  const externalReference = `parc_${row.id}`

  const params: MPCreatePaymentParams = {
    transaction_amount: Number(row.amount),
    description: `${ctx.enrollment.courseNome} — parcela ${row.number}`,
    payment_method_id: MP_BOLETO_METHOD_ID,
    external_reference: externalReference,
    notification_url: mpWebhookUrl(ctx.tenant.slug),
    date_of_expiration: boletoExpirationIso(row.dueDate),
    payer: {
      email: s.email,
      first_name: first,
      last_name: last,
      identification: { type: "CPF", number: s.cpf.replace(/\D/g, "") },
      address: {
        zip_code: s.cep.replace(/\D/g, ""),
        street_name: s.rua,
        street_number: s.numero,
        neighborhood: s.bairro,
        city: s.cidade,
        federal_unit: s.estado,
      },
    },
  }

  const payment = await createMpPayment(accessToken, params, externalReference)

  const invoiceUrl = payment.transaction_details?.external_resource_url ?? null
  const digitableLine = payment.transaction_details?.digitable_line ?? null

  const updated = await prisma.boletoInstallment.update({
    where: { id: row.id },
    data: {
      status: "GENERATED",
      mpPaymentId: String(payment.id),
      invoiceUrl,
      digitableLine,
      generatedAt: new Date(),
    },
  })
  return updated
}

/**
 * Emite (ou re-emite) o boleto MP de uma parcela agendada — usado pelo cron
 * quando o vencimento entra na janela de 7 dias. Carrega o contexto e delega.
 * No-op idempotente se a parcela já tem boleto (status != SCHEDULED).
 */
export async function generateMpBoletoForInstallment(
  installmentId: string,
): Promise<BoletoInstallment | null> {
  const row = await prisma.boletoInstallment.findUnique({
    where: { id: installmentId },
  })
  if (!row) return null
  if (row.gateway !== "MP") return row
  if (row.status !== "SCHEDULED") return row // já emitida
  const ctx = await loadContext(row.enrollmentId)
  try {
    return await emitMpBoletoForRow(row, ctx)
  } catch (err) {
    contextLogger().error(
      { err, event: "installments.mp_boleto_emit_failed", installmentId, enrollmentId: row.enrollmentId },
      "emissão de boleto MP da parcela falhou",
    )
    throw err
  }
}
