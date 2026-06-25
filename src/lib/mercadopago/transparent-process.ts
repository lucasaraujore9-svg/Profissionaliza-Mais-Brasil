import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createPayment, createPreapproval } from "./client"
import { fulfillFromMpPayment, type MpFulfillTenant } from "./fulfillment"
import { MAX_CARD_INSTALLMENTS } from "./installments"
import type { MPCreatePaymentParams } from "./types"

/**
 * Núcleo do Checkout Transparente do Mercado Pago, compartilhado pelas rotas de
 * `/process` da revenda (token do tenant) e do sistema mãe / PMB (token PMB).
 * Recebe o `formData` do form (cartão tokenizado no browser, ou PIX/boleto) e
 * cria o pagamento via `/v1/payments` (ou `/preapproval` no mensal), efetivando
 * a matrícula de forma síncrona quando aprovado. O webhook continua como rede
 * de segurança idempotente.
 */

/** formData do form de checkout. Permissivo: o shape varia por método. */
export const transparentFormDataSchema = z.object({
  token: z.string().optional(),
  issuer_id: z.union([z.string(), z.number()]).optional(),
  payment_method_id: z.string().min(1),
  installments: z.number().int().positive().optional(),
  payer: z
    .object({
      email: z.string().email().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      identification: z
        .object({
          type: z.string().optional(),
          number: z.string().optional(),
        })
        .optional(),
      address: z
        .object({
          zip_code: z.string().optional(),
          street_name: z.string().optional(),
          street_number: z.union([z.string(), z.number()]).optional(),
          neighborhood: z.string().optional(),
          city: z.string().optional(),
          federal_unit: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

export type TransparentFormData = z.infer<typeof transparentFormDataSchema>

export interface TransparentEnrollment {
  id: string
  finalAmount: number
  paymentType: string
  installmentsTotal: number | null
  externalReference: string
  courseNome: string
  studentNome: string | null
  studentEmail: string | null
  studentCpf: string | null
}

export interface TransparentCtx {
  accessToken: string
  fulfillTenant: MpFulfillTenant
  /** URL de notificação do webhook (com ?tenant=<slug> na revenda; sem na PMB). */
  notificationUrl: string
  /** URL de retorno da assinatura (preapproval) — só usada no mensal. */
  subscriptionBackUrl: string
}

export type TransparentResult =
  | { kind: "approved"; status: string }
  | {
      kind: "pending"
      pix?: { qrCode: string; qrCodeBase64: string; ticketUrl?: string }
      boleto?: { url: string; digitableLine?: string }
    }
  | { kind: "error"; httpStatus: number; error: string; code: string; statusDetail?: string }

/** Mensagens amigáveis para os status_detail de recusa mais comuns do MP. */
function rejectionMessage(statusDetail: string): string {
  const map: Record<string, string> = {
    cc_rejected_insufficient_amount: "Cartão sem saldo/limite suficiente.",
    cc_rejected_bad_filled_card_number: "Número do cartão inválido.",
    cc_rejected_bad_filled_security_code: "Código de segurança (CVV) inválido.",
    cc_rejected_bad_filled_date: "Data de validade inválida.",
    cc_rejected_call_for_authorize:
      "Autorize o pagamento com o emissor do cartão e tente novamente.",
    cc_rejected_card_disabled: "Cartão desabilitado. Contate o emissor.",
    cc_rejected_high_risk:
      "Pagamento recusado por segurança. Tente outro meio de pagamento.",
    cc_rejected_max_attempts:
      "Muitas tentativas. Aguarde e tente novamente mais tarde.",
  }
  return map[statusDetail] ?? "Pagamento recusado. Tente outro cartão ou método."
}

export async function processTransparentMpPayment(
  enrollment: TransparentEnrollment,
  formData: TransparentFormData,
  ctx: TransparentCtx,
): Promise<TransparentResult> {
  const amount = enrollment.finalAmount
  const externalReference = enrollment.externalReference
  const payerEmail = formData.payer?.email ?? enrollment.studentEmail ?? undefined
  const cpf =
    formData.payer?.identification?.number ?? enrollment.studentCpf ?? undefined

  if (!payerEmail) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "E-mail do pagador ausente",
      code: "PAYER_EMAIL_MISSING",
    }
  }

  // ── Mensal: assinatura transparente via card_token_id ──────────────────────
  if (enrollment.paymentType === "MONTHLY") {
    if (!formData.token) {
      return {
        kind: "error",
        httpStatus: 400,
        error: "Assinatura mensal exige cartão de crédito",
        code: "CARD_REQUIRED",
      }
    }
    const months = enrollment.installmentsTotal ?? 12
    const startDate = new Date(Date.now() + 60_000).toISOString()
    const endDate = new Date(
      Date.now() + months * 31 * 24 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const preapproval = await createPreapproval(ctx.accessToken, {
      reason: `Mensalidade — ${enrollment.courseNome}`,
      external_reference: externalReference,
      payer_email: payerEmail,
      card_token_id: formData.token,
      back_url: ctx.subscriptionBackUrl,
      notification_url: ctx.notificationUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: amount,
        currency_id: "BRL",
        start_date: startDate,
        end_date: endDate,
      },
      status: "authorized",
    })

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { mpSubscriptionId: preapproval.id, externalReference },
    })

    // A 1ª cobrança da assinatura chega via webhook e efetiva a matrícula lá.
    return { kind: "approved", status: "authorized" }
  }

  // ── À vista: cartão / PIX / boleto via POST /v1/payments ────────────────────
  const params: MPCreatePaymentParams = {
    transaction_amount: amount,
    description: enrollment.courseNome,
    payment_method_id: formData.payment_method_id,
    external_reference: externalReference,
    notification_url: ctx.notificationUrl,
    payer: {
      email: payerEmail,
      first_name: formData.payer?.first_name ?? enrollment.studentNome ?? undefined,
      last_name: formData.payer?.last_name,
      ...(cpf ? { identification: { type: "CPF", number: cpf } } : {}),
      ...(formData.payer?.address
        ? {
            address: {
              ...formData.payer.address,
              street_number:
                formData.payer.address.street_number !== undefined
                  ? String(formData.payer.address.street_number)
                  : undefined,
            },
          }
        : {}),
    },
  }
  if (formData.token) {
    params.token = formData.token
    // Cap defensivo: o teto de parcelas e sempre 12x, independente do que o
    // browser enviar (o valor real/juros e validado pelo MP no createPayment).
    params.installments = Math.min(
      Math.max(1, formData.installments ?? 1),
      MAX_CARD_INSTALLMENTS,
    )
    if (formData.issuer_id !== undefined) {
      params.issuer_id = String(formData.issuer_id)
    }
  }

  // Idempotência: cartão usa o token (único por submit, permite re-tentar com
  // outro cartão após recusa); PIX/boleto usam matrícula+método.
  const idempotencyKey = formData.token
    ? formData.token
    : `${enrollment.id}:${formData.payment_method_id}`

  const payment = await createPayment(ctx.accessToken, params, idempotencyKey)

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { mpPaymentId: String(payment.id), externalReference },
  })

  if (payment.status === "approved" || payment.status === "authorized") {
    await fulfillFromMpPayment(ctx.fulfillTenant, enrollment.id, payment)
    return { kind: "approved", status: payment.status }
  }

  if (payment.status === "rejected") {
    return {
      kind: "error",
      httpStatus: 400,
      error: rejectionMessage(payment.status_detail),
      code: "PAYMENT_REJECTED",
      statusDetail: payment.status_detail,
    }
  }

  // pending / in_process → PIX, boleto ou cartão em análise.
  const pix = payment.point_of_interaction?.transaction_data
  if (pix?.qr_code) {
    return {
      kind: "pending",
      pix: {
        qrCode: pix.qr_code,
        qrCodeBase64: pix.qr_code_base64 ?? "",
        ticketUrl: pix.ticket_url,
      },
    }
  }

  const boletoUrl = payment.transaction_details?.external_resource_url
  if (boletoUrl) {
    return {
      kind: "pending",
      boleto: {
        url: boletoUrl,
        digitableLine: payment.transaction_details?.digitable_line ?? undefined,
      },
    }
  }

  // Cartão em análise (in_process) — sem dados inline; aguarda webhook.
  return { kind: "pending" }
}
