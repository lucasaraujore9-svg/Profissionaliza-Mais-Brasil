import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  createPayment,
  createPreapproval,
  decryptTenantMpToken,
} from "@/lib/mercadopago/client"
import { fulfillFromMpPayment } from "@/lib/mercadopago/fulfillment"
import type { MPCreatePaymentParams } from "@/lib/mercadopago/types"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { mpWebhookUrl, vitrineUrl } from "@/lib/tenant/urls"

/**
 * formData devolvido pelo Payment Brick. Permissivo de propósito: o MP define
 * o shape e ele varia por método (cartão tem token/installments; PIX/boleto
 * não). NÃO confiamos em `transaction_amount` do cliente — o valor cobrado é
 * sempre `enrollment.finalAmount`.
 */
const formDataSchema = z.object({
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

const bodySchema = z.object({
  enrollmentId: z.string().min(1),
  formData: formDataSchema,
})

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

export const POST = withRequestContext(
  { action: "loja.checkout.process", route: "/api/loja/checkout/process" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

    // Resolve o tenant pelo header injetado pelo proxy (mesmo padrão do init).
    const tenantIdHeader = request.headers.get("x-tenant-id")
    const tenantSlug = request.headers.get("x-tenant-slug")

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json(
        { error: "JSON inválido", code: "INVALID_JSON" },
        { status: 400 },
      )
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", code: "VALIDATION_ERROR" },
        { status: 400 },
      )
    }

    const { enrollmentId, formData } = parsed.data

    try {
      // Carrega a matrícula + tenant via relação — garante que a matrícula
      // pertence à loja do header e ainda está pendente.
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          status: true,
          tenantId: true,
          paymentType: true,
          finalAmount: true,
          installmentsTotal: true,
          externalReference: true,
          mpPaymentId: true,
          course: { select: { nome: true } },
          student: {
            select: { nome: true, email: true, cpf: true },
          },
          tenant: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              mpAccessToken: true,
              plataformaVendedorId: true,
            },
          },
        },
      })

      if (!enrollment || !enrollment.tenant) {
        return NextResponse.json(
          { error: "Matrícula não encontrada", code: "NOT_FOUND" },
          { status: 404 },
        )
      }

      // Confere que a matrícula é da loja do header (anti cross-tenant).
      const headerMatches = tenantIdHeader
        ? enrollment.tenantId === tenantIdHeader
        : tenantSlug
          ? enrollment.tenant.slug === tenantSlug
          : false
      if (!headerMatches) {
        return NextResponse.json(
          { error: "Matrícula inválida para esta loja", code: "TENANT_MISMATCH" },
          { status: 403 },
        )
      }

      // Idempotência: webhook ou clique duplo já efetivaram → devolve aprovado.
      if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
        return NextResponse.json({ data: { status: "approved" } })
      }

      if (enrollment.status !== "PENDING") {
        return NextResponse.json(
          { error: "Esta matrícula não pode ser paga", code: "INVALID_STATE" },
          { status: 409 },
        )
      }

      const tenant = enrollment.tenant
      if (tenant.status !== "ACTIVE" || !tenant.mpAccessToken) {
        return NextResponse.json(
          { error: "Loja indisponível para pagamento", code: "TENANT_INACTIVE" },
          { status: 403 },
        )
      }

      const accessToken = decryptTenantMpToken(tenant.mpAccessToken)
      // Valor cobrado SEMPRE do servidor — nunca do formData do cliente.
      const amount = Number(enrollment.finalAmount)
      const externalReference =
        enrollment.externalReference ?? `enr_${enrollment.id}`
      const payerEmail =
        formData.payer?.email ?? enrollment.student.email ?? undefined
      const cpf =
        formData.payer?.identification?.number ?? enrollment.student.cpf ?? undefined

      if (!payerEmail) {
        return NextResponse.json(
          { error: "E-mail do pagador ausente", code: "PAYER_EMAIL_MISSING" },
          { status: 400 },
        )
      }

      const fulfillTenant = {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        plataformaVendedorId: tenant.plataformaVendedorId,
        isPmbVitrine: false,
      }

      // ── Mensal: assinatura transparente via card_token_id ──────────────────
      if (enrollment.paymentType === "MONTHLY") {
        if (!formData.token) {
          return NextResponse.json(
            { error: "Assinatura mensal exige cartão de crédito", code: "CARD_REQUIRED" },
            { status: 400 },
          )
        }
        const months = enrollment.installmentsTotal ?? 12
        const startDate = new Date(Date.now() + 60_000).toISOString()
        const endDate = new Date(
          Date.now() + months * 31 * 24 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000,
        ).toISOString()
        const reqHost =
          request.headers.get("x-forwarded-host") ?? request.headers.get("host")
        const protocol = request.headers.get("x-forwarded-proto") ?? "https"
        const storeUrl = reqHost
          ? `${protocol}://${reqHost}`
          : vitrineUrl(tenantSlug ?? tenant.slug)

        const preapproval = await createPreapproval(accessToken, {
          reason: `Mensalidade — ${enrollment.course.nome}`,
          external_reference: externalReference,
          payer_email: payerEmail,
          card_token_id: formData.token,
          back_url: `${storeUrl}/loja/confirmacao?enrollment_id=${enrollment.id}`,
          notification_url: mpWebhookUrl(tenantSlug),
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

        // A 1ª cobrança da assinatura chega via webhook (payment /
        // subscription_authorized_payment) e efetiva a matrícula lá.
        return NextResponse.json({
          data: { status: "authorized", mode: "subscription" },
        })
      }

      // ── À vista: cartão / PIX / boleto via POST /v1/payments ────────────────
      const params: MPCreatePaymentParams = {
        transaction_amount: amount,
        description: enrollment.course.nome,
        payment_method_id: formData.payment_method_id,
        external_reference: externalReference,
        notification_url: mpWebhookUrl(tenantSlug),
        payer: {
          email: payerEmail,
          first_name: formData.payer?.first_name ?? enrollment.student.nome,
          last_name: formData.payer?.last_name,
          ...(cpf
            ? { identification: { type: "CPF", number: cpf } }
            : {}),
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
        params.installments = formData.installments ?? 1
        if (formData.issuer_id !== undefined) {
          params.issuer_id = String(formData.issuer_id)
        }
      }

      // Idempotência: cartão usa o token (único por submit, permite re-tentar
      // com outro cartão após recusa); PIX/boleto usam matrícula+método (evita
      // gerar cobranças duplicadas).
      const idempotencyKey = formData.token
        ? formData.token
        : `${enrollment.id}:${formData.payment_method_id}`

      const payment = await createPayment(accessToken, params, idempotencyKey)

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { mpPaymentId: String(payment.id), externalReference },
      })

      if (payment.status === "approved" || payment.status === "authorized") {
        await fulfillFromMpPayment(fulfillTenant, enrollment.id, payment)
        return NextResponse.json({ data: { status: payment.status } })
      }

      if (payment.status === "rejected") {
        return NextResponse.json(
          {
            error: rejectionMessage(payment.status_detail),
            code: "PAYMENT_REJECTED",
            statusDetail: payment.status_detail,
          },
          { status: 400 },
        )
      }

      // pending / in_process → PIX, boleto ou cartão em análise.
      const pix = payment.point_of_interaction?.transaction_data
      if (pix?.qr_code) {
        return NextResponse.json({
          data: {
            status: "pending",
            pix: {
              qrCode: pix.qr_code,
              qrCodeBase64: pix.qr_code_base64 ?? "",
              ticketUrl: pix.ticket_url,
            },
          },
        })
      }

      const boletoUrl = payment.transaction_details?.external_resource_url
      if (boletoUrl) {
        return NextResponse.json({
          data: {
            status: "pending",
            boleto: {
              url: boletoUrl,
              digitableLine: payment.transaction_details?.digitable_line ?? undefined,
            },
          },
        })
      }

      // Cartão em análise (in_process) — sem dados inline; aguarda webhook.
      return NextResponse.json({ data: { status: "pending" } })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "loja.checkout.process_failed", enrollmentId },
        "process de pagamento transparente falhou",
      )
      return NextResponse.json(
        { error: "Erro ao processar o pagamento", code: "INTERNAL_ERROR" },
        { status: 500 },
      )
    }
  },
)
