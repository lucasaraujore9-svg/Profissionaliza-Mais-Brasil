/**
 * Cobrança de UMA linha do parcelado (venda direta com meio escolhido pelo
 * pagador): PIX, boleto ou cartão 1x, no Asaas ou no Mercado Pago. Spec:
 * docs/superpowers/specs/2026-11-06-venda-direta-parcelada-design.md ("Emissão").
 *
 * Invariante: nunca duas cobranças vivas para a mesma linha. Mesmo método em
 * aberto no gateway → devolve a mesma; outro método → a anterior é removida (e
 * a remoção CONFIRMADA) antes de criar a nova. Tudo sob lock por linha: venda,
 * página e cron nunca emitem a mesma linha ao mesmo tempo.
 *
 * Os webhooks já liquidam o que sai daqui sem mudança: o Asaas casa a linha por
 * `asaasPaymentId` antes de olhar `externalReference` (reseller-process.ts e o
 * ramo `pmbParcel` de process.ts), e o MP roteia `parc_<rowId>` para a linha.
 */
import type { BoletoInstallment } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { advisoryLockKeyFrom, withAdvisoryLock, type TenantContext } from "@/lib/enrollment/fulfill"
import {
  createPayment as createAsaasPayment,
  decryptTenantAsaasKey,
  deletePayment as deleteAsaasPayment,
  getPayment as getAsaasPayment,
  listPayments as listAsaasPayments,
  motherAsaasKey,
  payWithCreditCard,
  AsaasApiError,
} from "@/lib/asaas/client"
import type { AsaasCreditCard, AsaasCreditCardHolderInfo, AsaasPayment } from "@/lib/asaas/types"
import { asaasPixInstrument } from "@/lib/asaas/payment-instrument"
import {
  asaasErrorToResult,
  boletoResult,
  CONFIRMED_STATUSES,
  PENDING_STATUSES,
} from "@/lib/asaas/transparent-process"
import {
  cancelPayment as cancelMpPayment,
  createPayment as createMpPayment,
  decryptTenantMpToken,
  getPayment as getMpPayment,
} from "@/lib/mercadopago/client"
import type { MPCreatePaymentParams, MPPayment } from "@/lib/mercadopago/types"
import type { TransparentFormData } from "@/lib/mercadopago/transparent-process"
import { asaasSplitsForEnrollment } from "@/lib/course-authoring/split-server"
import { saveBoletoAddress } from "@/lib/subscriptions/carne"
import { asaasWebhookUrl, mpWebhookUrl } from "@/lib/tenant/urls"
import { pmbMpAccessToken, pmbPlataformaPolo, pmbPlataformaVendedorId, PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { brDayIso, utcDayIso } from "@/lib/dates"
import { loadContext, resolveAsaasCustomerId, type PlanContext } from "./plan"
import { hasCompleteBoletoAddress, mpBoletoPaymentParams, type BoletoAddress } from "./mp-boleto"
import { settleBoletoInstallment, type InstallmentPaymentEvent } from "./settle"
import type { FlexMethod } from "./flex"

/** QUEM PAGA (monte com `resolvePayer`: com aluno menor, o responsável). */
export interface FlexPayer {
  nome: string
  email: string | null
  cpf: string | null
  phone?: string | null
  /** Endereço digitado agora (boleto MP). Completo → salvo no aluno. */
  address?: BoletoAddress
  /** IP do comprador — o Asaas exige no cartão. */
  remoteIp?: string | null
}

/** Cartão já mapeado do form: Asaas (`asaasFormDataSchema` → buildCardPair) ou MP (token do SDK). */
export type FlexCardInput =
  | { gateway: "ASAAS"; creditCard: AsaasCreditCard; creditCardHolderInfo: AsaasCreditCardHolderInfo }
  | {
      gateway: "MP"
      token: string
      paymentMethodId: TransparentFormData["payment_method_id"]
      issuerId?: string
    }

export type FlexChargeResult =
  | { kind: "approved" }
  | { kind: "pending"; pix?: { qrCode: string; qrCodeBase64: string }; boleto?: { url: string; digitableLine?: string } }
  | { kind: "error"; httpStatus: number; code: string; error: string }

interface ChargeInput {
  rowId: string
  /** CREDIT_CARD aqui = 1x avulsa (entrada). */
  method: FlexMethod
  payer: FlexPayer
  card?: FlexCardInput
}

export const fail = (httpStatus: number, code: string, error: string): FlexChargeResult =>
  ({ kind: "error", httpStatus, code, error })

export const STUCK = fail(
  409,
  "PREVIOUS_CHARGE_STUCK",
  "Não foi possível substituir a cobrança anterior desta parcela. Tente novamente em instantes.",
)

export async function chargeFlexRow(input: ChargeInput): Promise<FlexChargeResult> {
  let result = fail(
    409,
    "PAYMENT_IN_PROGRESS",
    "Já existe um pagamento em processamento para esta parcela. Aguarde alguns segundos.",
  )
  await withAdvisoryLock(advisoryLockKeyFrom(`FLEX_ROW:${input.rowId}`), async () => {
    result = await chargeUnderLock(input)
  })
  return result
}

async function chargeUnderLock(input: ChargeInput): Promise<FlexChargeResult> {
  const row = await prisma.boletoInstallment.findUnique({ where: { id: input.rowId } })
  if (!row) return fail(404, "ROW_NOT_FOUND", "Parcela não encontrada")
  if (row.status === "PAID") return { kind: "approved" }
  if (row.status === "CANCELLED") return fail(409, "ROW_NOT_PAYABLE", "Esta parcela não está disponível para pagamento")
  if (input.method === "CREDIT_CARD" && input.card?.gateway !== row.gateway) {
    return fail(400, "CARD_REQUIRED", "Dados do cartão ausentes")
  }
  const ctx = await loadContext(row.enrollmentId)
  // Carnê antigo tem cobranças nativas do parcelamento Asaas: apagar uma delas
  // aqui quebraria o carnê.
  if (!ctx.enrollment.flexInstallments) return fail(409, "NOT_FLEX", "Esta parcela não é de um plano parcelado")
  const settle = (event: InstallmentPaymentEvent) =>
    settleBoletoInstallment({ installment: row, tenant: tenantContext(ctx), event })
  return row.gateway === "ASAAS" ? chargeAsaas(row, ctx, input, settle) : chargeMp(row, ctx, input, settle)
}

export function tenantContext(ctx: PlanContext): TenantContext {
  if (!ctx.tenant) {
    return {
      id: PMB_TENANT_SLUG,
      slug: pmbPlataformaPolo(),
      plataformaVendedorId: pmbPlataformaVendedorId(),
      isPmbVitrine: true,
    }
  }
  const t = ctx.tenant
  return { id: t.id, slug: t.slug, name: t.name, plataformaVendedorId: t.plataformaVendedorId, isPmbVitrine: false }
}

const description = (ctx: PlanContext, row: BoletoInstallment) =>
  `${ctx.enrollment.courseNome} — parcela ${row.number}`

const sameValue = (a: number, row: BoletoInstallment) => Math.abs(a - Number(row.amount)) < 0.01

type Settle = (event: InstallmentPaymentEvent) => Promise<void>

// ── Asaas ────────────────────────────────────────────────────────────────────

type Charger = (row: BoletoInstallment, ctx: PlanContext, input: ChargeInput, settle: Settle) => Promise<FlexChargeResult>

/** Vitrine PMB na conta-mãe; venda da unidade, na conta dela. null = unidade sem Asaas. */
export function asaasKeyFor(ctx: PlanContext): string | null {
  if (ctx.tenant === null) return motherAsaasKey()
  return ctx.tenant.asaasApiKey ? decryptTenantAsaasKey(ctx.tenant.asaasApiKey) : null
}

export async function mpTokenFor(ctx: PlanContext): Promise<string | null> {
  if (!ctx.tenant) return pmbMpAccessToken()
  return ctx.tenant.mpAccessToken ? decryptTenantMpToken(ctx.tenant.mpAccessToken) : null
}

export const asaasEvent = (p: AsaasPayment): InstallmentPaymentEvent => ({
  gateway: "ASAAS",
  externalPaymentId: p.id,
  amount: p.value,
  paidAt: p.paymentDate ? new Date(p.paymentDate) : new Date(),
})

export const mpEvent = (p: MPPayment): InstallmentPaymentEvent => ({
  gateway: "MP",
  externalPaymentId: String(p.id),
  amount: p.transaction_amount,
  paidAt: p.date_approved ? new Date(p.date_approved) : new Date(),
  mpPaymentType: p.payment_type_id,
})

/** "missing" = 404 (não existe mais); null = leitura falhou. */
export async function readAsaasPayment(id: string, apiKey: string): Promise<AsaasPayment | "missing" | null> {
  try {
    return await getAsaasPayment(id, apiKey)
  } catch (err) {
    return err instanceof AsaasApiError && err.statusCode === 404 ? "missing" : null
  }
}

/**
 * Resultado de tirar do ar a cobrança anterior de uma linha: removida (com
 * prova), paga (liquidar, não remover), em análise (aguardar) ou presa.
 */
export type Release<P> = { kind: "released" } | { kind: "paid"; payment: P } | { kind: "busy" } | { kind: "stuck" }

/** DELETE do Asaas é soft: só `deleted: true` (ou 404) na releitura prova a remoção. */
export async function releaseAsaasCharge(prev: AsaasPayment | "missing", apiKey: string): Promise<Release<AsaasPayment>> {
  if (prev === "missing" || prev.deleted) return { kind: "released" }
  if (CONFIRMED_STATUSES.has(prev.status)) return { kind: "paid", payment: prev }
  // Em análise / reversão: outra cobrança por cima cobraria duas vezes.
  if (prev.status !== "PENDING" && prev.status !== "OVERDUE") {
    return PENDING_STATUSES.has(prev.status) ? { kind: "busy" } : { kind: "stuck" }
  }
  await deleteAsaasPayment(prev.id, apiKey).catch(() => null)
  const after = await readAsaasPayment(prev.id, apiKey)
  if (after && after !== "missing" && CONFIRMED_STATUSES.has(after.status)) return { kind: "paid", payment: after }
  return after === "missing" || after?.deleted ? { kind: "released" } : { kind: "stuck" }
}

/** MP: só `status: "cancelled"` (na resposta ou na releitura) prova o cancelamento. */
export async function releaseMpCharge(token: string, prev: MPPayment): Promise<Release<MPPayment>> {
  if (prev.status === "approved") return { kind: "paid", payment: prev }
  if (prev.status === "in_process" || prev.status === "authorized" || prev.status === "in_mediation") {
    return { kind: "busy" }
  }
  if (prev.status === "pending") {
    const cancelled = await cancelMpPayment(token, String(prev.id)).catch(() => null)
    if (cancelled?.status !== "cancelled") {
      const after = await getMpPayment(token, prev.id).catch(() => null)
      if (after?.status === "approved") return { kind: "paid", payment: after }
      if (after?.status !== "cancelled") return { kind: "stuck" }
    }
  }
  // rejected / cancelled (PIX ou boleto expirado) / estornado: nada vivo.
  return { kind: "released" }
}

const chargeAsaas: Charger = async (row, ctx, input, settle) => {
  const isPmb = ctx.tenant === null
  const apiKey = asaasKeyFor(ctx)
  if (!apiKey) return fail(409, "GATEWAY_NOT_CONNECTED", "Unidade sem conta Asaas conectada")
  if (!input.payer.cpf) return fail(400, "PAYER_CPF_MISSING", "CPF do pagador é obrigatório no Asaas")
  const method = input.method
  const settleAsaas = async (p: AsaasPayment): Promise<FlexChargeResult> => {
    await settle(asaasEvent(p))
    return { kind: "approved" }
  }

  let payment: AsaasPayment | null = null
  if (row.asaasPaymentId) {
    const prev = await readAsaasPayment(row.asaasPaymentId, apiKey)
    if (prev === null) return STUCK
    if (prev !== "missing" && !prev.deleted && prev.status === "PENDING" && prev.billingType === method && sameValue(prev.value, row)) {
      payment = prev
    } else {
      const r = await releaseAsaasCharge(prev, apiKey)
      if (r.kind === "paid") return settleAsaas(r.payment)
      if (r.kind === "busy") return { kind: "pending" }
      if (r.kind === "stuck") return STUCK
    }
  }

  if (!payment) {
    const externalReference = `carne_${ctx.enrollment.id}`
    // O Asaas não aceita vencimento no passado: linha atrasada vence hoje.
    const today = brDayIso(new Date())
    const due = utcDayIso(row.dueDate)
    const dueDate = due < today ? today : due
    try {
      payment =
        (await findOrphan(externalReference, dueDate, method, row, apiKey)) ??
        (await createAsaasPayment(
          {
            customer: await resolveAsaasCustomerId(ctx, apiKey, isPmb, {
              nome: input.payer.nome,
              email: input.payer.email,
              cpf: input.payer.cpf,
              fone: input.payer.phone ?? null,
            }),
            billingType: method,
            value: Number(row.amount),
            dueDate,
            description: description(ctx, row),
            // NÃO `enr_`: o webhook casa a linha por asaasPaymentId; `enr_`
            // mandaria a cobrança para o ramo de matrícula.
            externalReference,
            notificationUrl: asaasWebhookUrl(ctx.tenant?.slug ?? undefined),
            // Esquecer o split = produtor nunca recebe. undefined quando não há.
            splits: await asaasSplitsForEnrollment(ctx.enrollment.id),
          },
          apiKey,
        ))
    } catch (err) {
      return asaasErrorToResult(err)
    }
    // Grava ANTES de capturar o cartão / buscar o QR: a cobrança fica
    // rastreável mesmo se o passo seguinte cair.
    await prisma.boletoInstallment.update({
      where: { id: row.id },
      data: {
        asaasPaymentId: payment.id,
        method,
        status: "GENERATED",
        invoiceUrl: method === "BOLETO" ? payment.bankSlipUrl ?? null : null,
        digitableLine: null,
        generatedAt: new Date(),
      },
    })
  }

  if (method === "PIX") {
    const pix = await asaasPixInstrument(payment.id, apiKey)
    return pix ? { kind: "pending", pix } : fail(502, "PIX_UNAVAILABLE", "Não foi possível gerar o PIX desta parcela")
  }
  if (method === "BOLETO") {
    const res = await boletoResult(payment, apiKey)
    if (res.kind === "pending" && res.boleto) {
      await prisma.boletoInstallment.update({
        where: { id: row.id },
        data: { invoiceUrl: res.boleto.url, digitableLine: res.boleto.digitableLine ?? null },
      })
    }
    return res
  }

  const card = input.card as Extract<FlexCardInput, { gateway: "ASAAS" }>
  try {
    const paid = await payWithCreditCard(
      payment.id,
      {
        creditCard: card.creditCard,
        creditCardHolderInfo: card.creditCardHolderInfo,
        remoteIp: input.payer.remoteIp ?? "0.0.0.0",
      },
      apiKey,
    )
    if (CONFIRMED_STATUSES.has(paid.status)) return settleAsaas(paid)
    if (PENDING_STATUSES.has(paid.status)) return { kind: "pending" }
    return fail(400, "PAYMENT_REJECTED", "Pagamento recusado. Tente outro cartão ou método.")
  } catch (err) {
    return asaasErrorToResult(err)
  }
}

/**
 * Cobrança criada por uma tentativa que caiu antes de gravar a linha. O Asaas
 * não tem idempotência: sem esta busca, a nova tentativa emitiria uma segunda
 * cobrança da mesma parcela (padrão `findOrphanAsaasCharge` da assinatura).
 */
async function findOrphan(
  externalReference: string,
  dueDate: string,
  method: FlexMethod,
  row: BoletoInstallment,
  apiKey: string,
): Promise<AsaasPayment | null> {
  const list = await listAsaasPayments({ externalReference, limit: 100, offset: 0 }, apiKey).catch(() => null)
  for (const p of list?.data ?? []) {
    if (p.deleted || p.status !== "PENDING" || p.billingType !== method) continue
    if (p.dueDate !== dueDate || !sameValue(p.value, row)) continue
    const linked = await prisma.boletoInstallment.findFirst({ where: { asaasPaymentId: p.id }, select: { id: true } })
    if (!linked) return p
  }
  return null
}

// ── Mercado Pago ─────────────────────────────────────────────────────────────

function mpPending(p: MPPayment): FlexChargeResult {
  const qr = p.point_of_interaction?.transaction_data
  if (qr?.qr_code) return { kind: "pending", pix: { qrCode: qr.qr_code, qrCodeBase64: qr.qr_code_base64 ?? "" } }
  const url = p.transaction_details?.external_resource_url
  if (url) return { kind: "pending", boleto: { url, digitableLine: p.transaction_details?.digitable_line ?? undefined } }
  return { kind: "pending" }
}

const chargeMp: Charger = async (row, ctx, input, settle) => {
  const token = await mpTokenFor(ctx)
  if (!token) return fail(409, "GATEWAY_NOT_CONNECTED", "Mercado Pago não conectado")
  const { payer, method } = input
  if (!payer.email) return fail(400, "PAYER_EMAIL_MISSING", "E-mail do pagador ausente")

  // Endereço ANTES de mexer na cobrança anterior: pedido recusado não pode ter
  // cancelado o PIX em aberto do aluno.
  const student = ctx.enrollment.student
  const given = payer.address && hasCompleteBoletoAddress(payer.address) ? payer.address : null
  const address = given ?? (hasCompleteBoletoAddress(student) ? student : null)
  if (method === "BOLETO") {
    if (!payer.cpf) return fail(400, "PAYER_CPF_MISSING", "CPF do pagador é obrigatório no boleto")
    if (!address) return fail(400, "ADDRESS_REQUIRED", "Endereço completo é obrigatório no boleto")
    if (given) await saveBoletoAddress(student.id, given)
  }

  const settleMp = async (p: MPPayment): Promise<FlexChargeResult> => {
    await settle(mpEvent(p))
    return { kind: "approved" }
  }

  if (row.mpPaymentId) {
    const prev = await getMpPayment(token, row.mpPaymentId).catch(() => null)
    if (!prev) return STUCK
    if (
      prev.status === "pending" &&
      row.method === method &&
      method !== "CREDIT_CARD" &&
      sameValue(prev.transaction_amount, row)
    ) {
      return mpPending(prev)
    }
    const r = await releaseMpCharge(token, prev)
    if (r.kind === "paid") return settleMp(r.payment)
    if (r.kind === "busy") return { kind: "pending" }
    if (r.kind === "stuck") return STUCK
  }

  const externalReference = `parc_${row.id}`
  const notificationUrl = mpWebhookUrl(ctx.tenant?.slug)
  const amount = Number(row.amount)
  const card = input.card?.gateway === "MP" ? input.card : null
  const params: MPCreatePaymentParams =
    method === "BOLETO"
      ? mpBoletoPaymentParams({
          amount,
          description: description(ctx, row),
          externalReference,
          notificationUrl,
          dueDate: row.dueDate,
          payer: { nome: payer.nome, email: payer.email, cpf: payer.cpf! },
          address: address!,
        })
      : {
          transaction_amount: amount,
          description: description(ctx, row),
          payment_method_id: card ? card.paymentMethodId : "pix",
          external_reference: externalReference,
          notification_url: notificationUrl,
          payer: {
            email: payer.email,
            first_name: payer.nome,
            ...(payer.cpf ? { identification: { type: "CPF", number: payer.cpf.replace(/\D/g, "") } } : {}),
          },
          ...(card
            ? { token: card.token, installments: 1, ...(card.issuerId ? { issuer_id: card.issuerId } : {}) }
            : {}),
        }

  // `updatedAt` entra na chave: a linha é regravada a cada emissão, então a
  // tentativa seguinte (outro método, outro cartão depois da recusa) ganha
  // chave nova; a retentativa da MESMA emissão repete a chave e o MP devolve o
  // mesmo pagamento.
  const payment = await createMpPayment(token, params, `${externalReference}:${row.updatedAt.getTime()}:${method}`)
  const rejected = payment.status === "rejected"
  await prisma.boletoInstallment.update({
    where: { id: row.id },
    data: {
      mpPaymentId: String(payment.id),
      method,
      ...(rejected ? {} : { status: "GENERATED" as const, generatedAt: new Date() }),
      // Só o PDF do boleto (`external_resource_url`), nunca a página do MP.
      invoiceUrl: payment.transaction_details?.external_resource_url ?? null,
      digitableLine: payment.transaction_details?.digitable_line ?? null,
    },
  })

  if (payment.status === "approved") return settleMp(payment)
  if (rejected) return fail(400, "PAYMENT_REJECTED", "Pagamento recusado. Tente outro cartão ou método.")
  return mpPending(payment)
}
