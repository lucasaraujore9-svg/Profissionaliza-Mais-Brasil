/**
 * Cartão no parcelado = assinatura do gateway sobre as linhas restantes (spec
 * docs/superpowers/specs/2026-11-06-venda-direta-parcelada-design.md, "Emissão").
 * Valor = valor da linha (as parcelas são iguais), nº de cobranças = nº de
 * linhas abertas. Cada cobrança da assinatura que chega no webhook baixa a
 * próxima linha aberta (`settleFlexSubscriptionPayment`), uma vez só.
 *
 * As linhas do cartão ficam com `method: CREDIT_CARD` e SEM id de pagamento até
 * uma cobrança da assinatura ser paga: é esse id nulo que define "a próxima
 * linha" e serve de trava contra dois pagamentos disputando a mesma linha.
 */
import { Prisma, type BoletoInstallment } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { createSubscription as createAsaasSubscription, listPayments as listAsaasPayments } from "@/lib/asaas/client"
import type { AsaasPayment } from "@/lib/asaas/types"
import { asaasErrorToResult, CONFIRMED_STATUSES } from "@/lib/asaas/transparent-process"
import { createPreapproval, getPayment as getMpPayment, MPApiError } from "@/lib/mercadopago/client"
import { asaasSplitsForEnrollment } from "@/lib/course-authoring/split-server"
import { asaasWebhookUrl, appUrl, mpWebhookUrl } from "@/lib/tenant/urls"
import { addMonthsClampedUtc, brDayIso, utcDayIso } from "@/lib/dates"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"
import { loadContext, resolveAsaasCustomerId, type PlanContext } from "./plan"
import { settleBoletoInstallment, type InstallmentPaymentEvent } from "./settle"
import {
  asaasEvent,
  asaasKeyFor,
  fail,
  mpEvent,
  mpTokenFor,
  readAsaasPayment,
  releaseAsaasCharge,
  releaseMpCharge,
  STUCK,
  tenantContext,
  type FlexCardInput,
  type FlexChargeResult,
  type FlexPayer,
  type Release,
} from "./flex-charge"

const OPEN = ["SCHEDULED", "GENERATED", "OVERDUE"] as const

const IN_PROGRESS = fail(
  409,
  "PAYMENT_IN_PROGRESS",
  "Já existe um pagamento em processamento para esta parcela. Aguarde alguns segundos.",
)
const REJECTED = fail(400, "PAYMENT_REJECTED", "Pagamento recusado. Tente outro cartão ou método.")

interface StartInput {
  enrollmentId: string
  /** Linha da vez: a assinatura cobre ela e todas as abertas depois dela. */
  fromRowNumber: number
  payer: FlexPayer
  card: FlexCardInput
}

export async function startFlexCardSubscription(input: StartInput): Promise<FlexChargeResult> {
  let result = IN_PROGRESS
  // Uma assinatura por matrícula: dois cliques não criam duas.
  await withAdvisoryLock(advisoryLockKeyFrom(`FLEX_CARD:${input.enrollmentId}`), async () => {
    result = await startUnderEnrollmentLock(input)
  })
  return result
}

const openRowsFrom = (enrollmentId: string, fromRowNumber: number) =>
  prisma.boletoInstallment.findMany({
    where: { enrollmentId, number: { gte: fromRowNumber }, status: { in: [...OPEN] } },
    orderBy: { number: "asc" },
  })

async function startUnderEnrollmentLock(input: StartInput): Promise<FlexChargeResult> {
  const ctx = await loadContext(input.enrollmentId)
  if (!ctx.enrollment.flexInstallments) return fail(409, "NOT_FLEX", "Esta parcela não é de um plano parcelado")
  const subs = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { asaasSubscriptionId: true, mpSubscriptionId: true },
  })
  if (subs?.asaasSubscriptionId || subs?.mpSubscriptionId) {
    return fail(409, "SUBSCRIPTION_ACTIVE", "Esta matrícula já tem cobrança automática no cartão.")
  }
  const first = (await openRowsFrom(input.enrollmentId, input.fromRowNumber))[0]
  if (first?.number !== input.fromRowNumber) {
    return fail(409, "ROW_NOT_PAYABLE", "Esta parcela não está disponível para pagamento")
  }
  if (input.card.gateway !== first.gateway) return fail(400, "CARD_REQUIRED", "Dados do cartão ausentes")

  // Lock da linha da vez (o mesmo de chargeFlexRow): nenhum PIX/boleto nasce
  // nela enquanto a assinatura é criada. As linhas são relidas já sob o lock.
  let result = IN_PROGRESS
  await withAdvisoryLock(advisoryLockKeyFrom(`FLEX_ROW:${first.id}`), async () => {
    const rows = await openRowsFrom(input.enrollmentId, input.fromRowNumber)
    if (rows[0]?.id !== first.id) {
      result = fail(409, "ROW_NOT_PAYABLE", "Esta parcela não está disponível para pagamento")
      return
    }
    result = first.gateway === "ASAAS" ? await startAsaas(ctx, rows, input) : await startMp(ctx, rows, input)
  })
  return result
}

const reference = (ctx: PlanContext) =>
  ctx.enrollment.externalReference ?? `${ctx.tenant ? "" : "pmb_"}enr_${ctx.enrollment.id}`

const description = (ctx: PlanContext) => `${ctx.enrollment.courseNome} — parcelas no cartão`

/**
 * Tira do ar a cobrança PIX/boleto em aberto de cada linha (remoção CONFIRMADA)
 * e limpa o id: a linha passa a esperar a assinatura. Devolve o erro que
 * impede a assinatura, ou null.
 */
async function releaseRows(
  ctx: PlanContext,
  rows: BoletoInstallment[],
  release: (id: string) => Promise<Release<InstallmentPaymentEvent>>,
): Promise<FlexChargeResult | null> {
  for (const row of rows) {
    const field = row.gateway === "ASAAS" ? "asaasPaymentId" : "mpPaymentId"
    const id = row[field]
    if (!id) continue
    const r = await release(id)
    if (r.kind === "paid") {
      // A linha foi paga por fora neste instante: liquida e não assina por cima.
      await settleBoletoInstallment({ installment: row, tenant: tenantContext(ctx), event: r.payment })
      return fail(409, "ROW_ALREADY_PAID", "Esta parcela acabou de ser paga. Atualize a página.")
    }
    if (r.kind === "busy") return IN_PROGRESS
    if (r.kind === "stuck") return STUCK
    await prisma.boletoInstallment.update({
      where: { id: row.id },
      data: {
        [field]: null,
        method: null,
        invoiceUrl: null,
        digitableLine: null,
        ...(row.status === "GENERATED" ? { status: "SCHEDULED" as const } : {}),
      },
    })
  }
  return null
}

/**
 * Grava o plano no cartão: assinatura na matrícula e linhas vencendo hoje + k
 * meses (a 1ª cobrança é hoje), com auditoria da troca de datas.
 */
async function adoptCardSchedule(
  ctx: PlanContext,
  rows: BoletoInstallment[],
  subscription: { asaasSubscriptionId: string } | { mpSubscriptionId: string },
): Promise<void> {
  await prisma.enrollment.update({
    where: { id: ctx.enrollment.id },
    data: { installmentMethod: "CREDIT_CARD", externalReference: reference(ctx), ...subscription },
  })
  const today = new Date(`${brDayIso(new Date())}T12:00:00Z`)
  const after = rows.map((r, k) => ({ number: r.number, dueDate: addMonthsClampedUtc(today, k) }))
  for (const [k, row] of rows.entries()) {
    await prisma.boletoInstallment.update({
      where: { id: row.id },
      data: { dueDate: after[k].dueDate, method: "CREDIT_CARD", cardDeclinedAt: null, status: "SCHEDULED" },
    })
  }
  await logAudit({
    action: "enrollment.flex.card_schedule",
    resource: "Enrollment",
    resourceId: ctx.enrollment.id,
    actorRole: "SYSTEM",
    tenantId: ctx.enrollment.tenantId,
    payloadBefore: rows.map((r) => ({ number: r.number, dueDate: utcDayIso(r.dueDate) })),
    payloadAfter: { ...subscription, rows: after.map((r) => ({ number: r.number, dueDate: utcDayIso(r.dueDate) })) },
  })
}

async function startAsaas(ctx: PlanContext, rows: BoletoInstallment[], input: StartInput): Promise<FlexChargeResult> {
  const apiKey = asaasKeyFor(ctx)
  if (!apiKey) return fail(409, "GATEWAY_NOT_CONNECTED", "Unidade sem conta Asaas conectada")
  const { payer } = input
  if (!payer.cpf) return fail(400, "PAYER_CPF_MISSING", "CPF do pagador é obrigatório no Asaas")

  const blocked = await releaseRows(ctx, rows, async (id) => {
    const prev = await readAsaasPayment(id, apiKey)
    if (prev === null) return { kind: "stuck" }
    const r = await releaseAsaasCharge(prev, apiKey)
    return r.kind === "paid" ? { kind: "paid", payment: asaasEvent(r.payment) } : r
  })
  if (blocked) return blocked

  const card = input.card as Extract<FlexCardInput, { gateway: "ASAAS" }>
  let subscriptionId: string
  try {
    const subscription = await createAsaasSubscription(
      {
        customer: await resolveAsaasCustomerId(ctx, apiKey, ctx.tenant === null, {
          nome: payer.nome,
          email: payer.email,
          cpf: payer.cpf,
          fone: payer.phone ?? null,
        }),
        billingType: "CREDIT_CARD",
        // Rateio em CADA ciclo. Esquecer = produtor nunca recebe. undefined quando não há.
        splits: await asaasSplitsForEnrollment(ctx.enrollment.id),
        value: Number(rows[0].amount),
        nextDueDate: brDayIso(new Date()),
        cycle: "MONTHLY",
        description: description(ctx),
        externalReference: reference(ctx),
        maxPayments: rows.length,
        notificationUrl: asaasWebhookUrl(ctx.tenant?.slug ?? undefined),
        creditCard: card.creditCard,
        creditCardHolderInfo: card.creditCardHolderInfo,
        // Cartão no Asaas EXIGE o IP do comprador.
        remoteIp: payer.remoteIp ?? "0.0.0.0",
      },
      apiKey,
    )
    subscriptionId = subscription.id
  } catch (err) {
    return asaasErrorToResult(err)
  }
  // Grava ANTES de olhar a 1ª cobrança: o webhook dela casa pela assinatura.
  await adoptCardSchedule(ctx, rows, { asaasSubscriptionId: subscriptionId })

  // Como no MONTHLY: só "aprovado" com a 1ª cobrança capturada de verdade.
  let firstPayment: AsaasPayment | undefined
  for (let i = 0; i < 3 && !firstPayment; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 500))
    const list = await listAsaasPayments({ subscription: subscriptionId, limit: 1, offset: 0 }, apiKey).catch(() => null)
    firstPayment = list?.data?.[0]
  }
  if (firstPayment && CONFIRMED_STATUSES.has(firstPayment.status)) {
    await settleFlexSubscriptionPayment({ enrollmentId: ctx.enrollment.id, event: asaasEvent(firstPayment) })
    return { kind: "approved" }
  }
  return { kind: "pending" }
}

async function startMp(ctx: PlanContext, rows: BoletoInstallment[], input: StartInput): Promise<FlexChargeResult> {
  const token = await mpTokenFor(ctx)
  if (!token) return fail(409, "GATEWAY_NOT_CONNECTED", "Mercado Pago não conectado")
  const { payer } = input
  if (!payer.email) return fail(400, "PAYER_EMAIL_MISSING", "E-mail do pagador ausente")

  const blocked = await releaseRows(ctx, rows, async (id) => {
    const prev = await getMpPayment(token, id).catch(() => null)
    if (!prev) return { kind: "stuck" }
    const r = await releaseMpCharge(token, prev)
    return r.kind === "paid" ? { kind: "paid", payment: mpEvent(r.payment) } : r
  })
  if (blocked) return blocked

  const card = input.card as Extract<FlexCardInput, { gateway: "MP" }>
  const start = new Date(Date.now() + 60_000)
  // Fim entre a última cobrança (start + N-1 meses) e a que seria a seguinte
  // (start + N meses, >= 28 dias depois). A folga do MONTHLY (N × 31 dias + 3)
  // passa da N-ésima e deixaria o MP cobrar uma linha a mais.
  const end = addMonthsClampedUtc(start, rows.length - 1)
  end.setUTCDate(end.getUTCDate() + 15)
  let preapprovalId: string
  try {
    const preapproval = await createPreapproval(
      token,
      {
        reason: description(ctx),
        // A referência da PRÓPRIA matrícula: é por ela que o webhook acha a
        // matrícula (resolveEnrollmentId) e desvia para a baixa da linha.
        external_reference: reference(ctx),
        payer_email: payer.email,
        card_token_id: card.token,
        back_url: appUrl(),
        notification_url: mpWebhookUrl(ctx.tenant?.slug),
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: Number(rows[0].amount),
          currency_id: "BRL",
          start_date: start.toISOString(),
          end_date: end.toISOString(),
        },
        status: "authorized",
      },
      // Token do cartão é único por envio: outro cartão depois da recusa gera
      // assinatura nova; o reenvio do MESMO pedido devolve a mesma.
      `flexcard:${ctx.enrollment.id}:${card.token}`,
    )
    preapprovalId = preapproval.id
  } catch (err) {
    if (err instanceof MPApiError && err.statusCode >= 400 && err.statusCode < 500) return REJECTED
    throw err
  }
  await adoptCardSchedule(ctx, rows, { mpSubscriptionId: preapprovalId })
  // A 1ª cobrança do preapproval chega pelo webhook.
  return { kind: "pending" }
}

/**
 * Baixa a próxima linha aberta do plano no cartão com UMA cobrança da
 * assinatura. Idempotente pelo id do pagamento: linha já paga com ele →
 * "duplicate"; linha com ele mas ainda não liquidada (queda no meio) → retoma.
 */
export async function settleFlexSubscriptionPayment(input: {
  enrollmentId: string
  event: InstallmentPaymentEvent
}): Promise<"settled" | "duplicate" | "no_open_row"> {
  const { enrollmentId, event } = input
  const field = event.gateway === "ASAAS" ? "asaasPaymentId" : "mpPaymentId"
  for (let attempt = 0; attempt < 3; attempt++) {
    let row = await prisma.boletoInstallment.findFirst({
      where: { enrollmentId, [field]: event.externalPaymentId },
    })
    if (row?.status === "PAID") return "duplicate"
    if (!row) {
      const open = await prisma.boletoInstallment.findFirst({
        where: { enrollmentId, status: { in: [...OPEN] }, method: "CREDIT_CARD", [field]: null },
        orderBy: { number: "asc" },
      })
      if (!open) {
        contextLogger().error(
          { event: "installments.flex_card.no_open_row", enrollmentId, paymentId: event.externalPaymentId },
          "cobrança da assinatura sem linha aberta para baixar",
        )
        return "no_open_row"
      }
      try {
        // Compare-and-set: só reivindica a linha se ninguém a pegou no meio tempo.
        const { count } = await prisma.boletoInstallment.updateMany({
          where: { id: open.id, [field]: null },
          data: { [field]: event.externalPaymentId },
        })
        if (count === 0) continue
      } catch (err) {
        // @unique do id: a mesma cobrança entrou em outra linha por outra entrega.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate"
        throw err
      }
      row = { ...open, [field]: event.externalPaymentId }
    }
    await settleBoletoInstallment({ installment: row, tenant: tenantContext(await loadContext(enrollmentId)), event })
    return "settled"
  }
  throw new Error(`flex card: linha disputada sem fim (${enrollmentId})`)
}
