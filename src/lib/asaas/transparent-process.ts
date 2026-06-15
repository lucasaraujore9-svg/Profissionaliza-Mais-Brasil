import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { dueDateInDays } from "@/lib/checkout/due-date"
import {
  findOrCreateAsaasCustomer,
  getCustomer as getAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  getPixQrCode,
  getBillingInfo,
  listPayments as listAsaasPayments,
  AsaasApiError,
} from "./client"
import { fulfillFromAsaasPayment, type AsaasFulfillTenant } from "./fulfillment"
import type {
  AsaasCreditCard,
  AsaasCreditCardHolderInfo,
  AsaasPayment,
} from "./types"

/**
 * Núcleo do Checkout Transparente do Asaas para a conta PRÓPRIA da unidade
 * (revendedor recebendo do aluno). Espelha `processTransparentMpPayment`: o
 * comprador escolhe PIX / Cartão / Boleto e paga sem sair do site; o cartão é
 * enviado ao nosso servidor (TLS) e repassado ao Asaas (Asaas não tem SDK de
 * tokenização no browser como o MP). Devolve o MESMO `TransparentResult` do MP
 * para reaproveitar o restante da rota e a UI de resultado. O webhook continua
 * como rede de segurança idempotente (asaasPaymentId).
 */

/** formData do form de checkout Asaas. Card só quando method=CREDIT_CARD. */
export const asaasFormDataSchema = z.object({
  method: z.enum(["PIX", "CREDIT_CARD", "BOLETO"]),
  card: z
    .object({
      holderName: z.string().min(2),
      number: z.string().min(12),
      expiryMonth: z.string().min(1),
      expiryYear: z.string().min(2),
      ccv: z.string().min(3),
    })
    .optional(),
  // Endereço do titular — exigido pelo Asaas no cartão (creditCardHolderInfo) e
  // recomendado no boleto. CEP + número são o mínimo.
  postalCode: z.string().optional(),
  addressNumber: z.string().optional(),
  phone: z.string().optional(),
})

export type AsaasTransparentFormData = z.infer<typeof asaasFormDataSchema>

export interface AsaasTransparentEnrollment {
  id: string
  finalAmount: number
  paymentType: string
  installmentsTotal: number | null
  externalReference: string
  courseNome: string
  studentNome: string | null
  studentEmail: string | null
  studentCpf: string | null
  studentFone: string | null
  asaasCustomerId: string | null
}

export interface AsaasTransparentCtx {
  /** API key DESCRIPTOGRAFADA da conta Asaas da unidade. */
  apiKey: string
  fulfillTenant: AsaasFulfillTenant
  /** URL de notificação do webhook (com ?tenant=<slug>). */
  notificationUrl: string
  /** IP do COMPRADOR (x-forwarded-for) — exigido pelo Asaas no cartão. */
  remoteIp: string | null
}

// Reaproveita o mesmo contrato do MP para a rota/UI não precisarem ramificar.
export type TransparentResult =
  | { kind: "approved"; status: string }
  | {
      kind: "pending"
      pix?: { qrCode: string; qrCodeBase64: string; ticketUrl?: string }
      boleto?: { url: string; digitableLine?: string }
    }
  | { kind: "error"; httpStatus: number; error: string; code: string; statusDetail?: string }

const CONFIRMED_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])
const PENDING_STATUSES = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "AWAITING_CHARGEBACK_REVERSAL",
])

/** Resolve/cria o customer na conta Asaas DA UNIDADE (não a global da PMB). */
async function resolveCustomerId(
  enrollment: AsaasTransparentEnrollment,
  apiKey: string,
): Promise<string> {
  // O asaasCustomerId salvo no enrollment pertence à conta da unidade (gravado
  // por uma compra anterior nesta mesma conta) — tenta reutilizar; se sumiu
  // (conta trocada, id obsoleto), recria.
  if (enrollment.asaasCustomerId) {
    try {
      const existing = await getAsaasCustomer(enrollment.asaasCustomerId, apiKey)
      if (existing && !existing.deleted) return existing.id
    } catch (err) {
      if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
    }
  }
  const { customer } = await findOrCreateAsaasCustomer(
    {
      name: enrollment.studentNome ?? "Aluno",
      email: enrollment.studentEmail ?? undefined,
      cpfCnpj: enrollment.studentCpf ?? "",
      mobilePhone: enrollment.studentFone ?? undefined,
      externalReference: `student_enr_${enrollment.id}`,
    },
    apiKey,
  )
  return customer.id
}

function buildCardPair(
  formData: AsaasTransparentFormData,
  enrollment: AsaasTransparentEnrollment,
): { creditCard: AsaasCreditCard; creditCardHolderInfo: AsaasCreditCardHolderInfo } | null {
  if (!formData.card) return null
  const card = formData.card
  const cpf = (enrollment.studentCpf ?? "").replace(/\D/g, "")
  const postalCode = (formData.postalCode ?? "").replace(/\D/g, "")
  const phone = (formData.phone ?? enrollment.studentFone ?? "").replace(/\D/g, "")
  return {
    creditCard: {
      holderName: card.holderName,
      number: card.number.replace(/\s/g, ""),
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear.length === 2 ? `20${card.expiryYear}` : card.expiryYear,
      ccv: card.ccv,
    },
    creditCardHolderInfo: {
      name: card.holderName || (enrollment.studentNome ?? "Aluno"),
      email: enrollment.studentEmail ?? "",
      cpfCnpj: cpf,
      postalCode,
      addressNumber: formData.addressNumber ?? "0",
      phone,
    },
  }
}

export async function processTransparentAsaasPayment(
  enrollment: AsaasTransparentEnrollment,
  formData: AsaasTransparentFormData,
  ctx: AsaasTransparentCtx,
): Promise<TransparentResult> {
  if (!enrollment.studentCpf) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "CPF do pagador é obrigatório no Asaas",
      code: "PAYER_CPF_MISSING",
    }
  }
  if (formData.method === "CREDIT_CARD" && !formData.card) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "Dados do cartão ausentes",
      code: "CARD_REQUIRED",
    }
  }

  const apiKey = ctx.apiKey
  const customerId = await resolveCustomerId(enrollment, apiKey)
  const description = enrollment.courseNome
  const externalReference = enrollment.externalReference

  // ── Mensal: assinatura no cartão ────────────────────────────────────────────
  if (enrollment.paymentType === "MONTHLY") {
    if (!formData.card) {
      return {
        kind: "error",
        httpStatus: 400,
        error: "Assinatura mensal exige cartão de crédito",
        code: "CARD_REQUIRED",
      }
    }
    const cardPair = buildCardPair(formData, enrollment)
    const months = enrollment.installmentsTotal ?? 12
    try {
      const subscription = await createAsaasSubscription(
        {
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: enrollment.finalAmount,
          nextDueDate: dueDateInDays(0),
          cycle: "MONTHLY",
          description: `Mensalidade — ${description}`,
          externalReference,
          maxPayments: months,
          notificationUrl: ctx.notificationUrl,
          ...(cardPair ?? {}),
          ...(ctx.remoteIp ? { remoteIp: ctx.remoteIp } : {}),
        },
        apiKey,
      )

      // Captura o id/URL da 1ª cobrança gerada (para reconciliação/retorno).
      let firstInvoiceUrl: string | null = null
      let firstPaymentId: string | null = null
      for (let i = 0; i < 3; i++) {
        const list = await listAsaasPayments(
          { subscription: subscription.id, limit: 1, offset: 0 },
          apiKey,
        ).catch(() => null)
        const first = list?.data?.[0]
        if (first) {
          firstInvoiceUrl = first.invoiceUrl
          firstPaymentId = first.id
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      }

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          externalReference,
          asaasCustomerId: customerId,
          asaasSubscriptionId: subscription.id,
          asaasPaymentId: firstPaymentId,
          asaasInvoiceUrl: firstInvoiceUrl,
        },
      })

      // A 1ª cobrança no cartão é capturada imediatamente; a matrícula é
      // efetivada pelo webhook (PAYMENT_CONFIRMED) — mesmo modelo do MP mensal.
      return { kind: "approved", status: "authorized" }
    } catch (err) {
      return asaasErrorToResult(err)
    }
  }

  // ── À vista: PIX / cartão / boleto ──────────────────────────────────────────
  const billingType =
    formData.method === "PIX"
      ? "PIX"
      : formData.method === "BOLETO"
        ? "BOLETO"
        : "CREDIT_CARD"

  const cardPair =
    formData.method === "CREDIT_CARD" ? buildCardPair(formData, enrollment) : null

  let payment: AsaasPayment
  try {
    payment = await createAsaasPayment(
      {
        customer: customerId,
        billingType,
        value: enrollment.finalAmount,
        // Cartão captura na hora; PIX/boleto vencem em 3 dias.
        dueDate: dueDateInDays(billingType === "CREDIT_CARD" ? 0 : 3),
        description: `Curso: ${description}`,
        externalReference,
        notificationUrl: ctx.notificationUrl,
        ...(cardPair ?? {}),
        ...(billingType === "CREDIT_CARD" && ctx.remoteIp ? { remoteIp: ctx.remoteIp } : {}),
      },
      apiKey,
    )
  } catch (err) {
    return asaasErrorToResult(err)
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      externalReference,
      asaasCustomerId: customerId,
      asaasPaymentId: payment.id,
      asaasInvoiceUrl: payment.invoiceUrl,
    },
  })

  // Cartão capturado na hora → efetiva já (webhook é só rede de segurança).
  if (CONFIRMED_STATUSES.has(payment.status)) {
    await fulfillFromAsaasPayment(ctx.fulfillTenant, enrollment.id, payment)
    return { kind: "approved", status: payment.status }
  }

  // PIX → QR Code inline.
  if (billingType === "PIX") {
    const qr = await getPixQrCode(payment.id, apiKey).catch(() => null)
    if (qr?.payload) {
      return {
        kind: "pending",
        pix: {
          qrCode: qr.payload,
          qrCodeBase64: qr.encodedImage ?? "",
          ticketUrl: payment.invoiceUrl,
        },
      }
    }
    // Sem QR (raro) — devolve a fatura hospedada como fallback.
    return {
      kind: "pending",
      boleto: { url: payment.invoiceUrl },
    }
  }

  // Boleto → linha digitável + URL do PDF.
  if (billingType === "BOLETO") {
    let digitableLine: string | undefined
    const billing = await getBillingInfo(payment.id, apiKey).catch(() => null)
    if (billing?.bankSlip?.identificationField) {
      digitableLine = billing.bankSlip.identificationField
    }
    return {
      kind: "pending",
      boleto: {
        url: payment.bankSlipUrl ?? payment.invoiceUrl,
        digitableLine,
      },
    }
  }

  // Cartão em análise de risco — sem dados inline; aguarda webhook.
  if (PENDING_STATUSES.has(payment.status)) {
    return { kind: "pending" }
  }

  // Qualquer outro status no cartão = recusado.
  return {
    kind: "error",
    httpStatus: 400,
    error: "Pagamento recusado. Tente outro cartão ou método.",
    code: "PAYMENT_REJECTED",
    statusDetail: payment.status,
  }
}

/** Converte AsaasApiError (ex.: cartão recusado) num TransparentResult de erro. */
function asaasErrorToResult(err: unknown): TransparentResult {
  if (err instanceof AsaasApiError) {
    const description = err.errors?.[0]?.description
    // 4xx → erro de negócio (cartão recusado, dado inválido) → 400 amigável.
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return {
        kind: "error",
        httpStatus: 400,
        error: description ?? "Pagamento recusado. Confira os dados e tente novamente.",
        code: "PAYMENT_REJECTED",
      }
    }
  }
  // 5xx/rede → deixa a rota responder 500 (Asaas/comprador pode re-tentar).
  throw err
}
