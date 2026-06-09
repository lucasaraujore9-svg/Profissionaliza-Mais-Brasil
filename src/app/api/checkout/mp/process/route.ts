import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  processTransparentMpPayment,
  transparentFormDataSchema,
} from "@/lib/mercadopago/transparent-process"
import {
  pmbMpAccessToken,
  pmbPlataformaPolo,
  pmbPlataformaVendedorId,
  PMB_PUBLIC_NAME,
} from "@/lib/pmb-config"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { mpWebhookUrl } from "@/lib/tenant/urls"

const bodySchema = z.object({
  enrollmentId: z.string().min(1),
  formData: transparentFormDataSchema,
})

/**
 * Process do Checkout Transparente do sistema mãe (vitrine PMB, tenantId=null)
 * quando `pmbDirectSaleGateway = MP`. Espelha /api/loja/checkout/process, mas
 * usa o token/contexto da conta MP da PMB. O webhook continua como rede de
 * segurança (buildPmbContext, sem ?tenant= na notification_url).
 */
export const POST = withRequestContext(
  { action: "pmb.checkout.mp.process", route: "/api/checkout/mp/process" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

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
      // Matrícula PMB = tenantId null. Anti-IDOR: nunca toca matrícula de revenda.
      const enrollment = await prisma.enrollment.findFirst({
        where: { id: enrollmentId, tenantId: null },
        select: {
          id: true,
          status: true,
          paymentType: true,
          finalAmount: true,
          installmentsTotal: true,
          externalReference: true,
          course: { select: { nome: true } },
          student: { select: { nome: true, email: true, cpf: true } },
        },
      })

      if (!enrollment) {
        return NextResponse.json(
          { error: "Matrícula não encontrada", code: "NOT_FOUND" },
          { status: 404 },
        )
      }

      if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
        return NextResponse.json({ data: { status: "approved" } })
      }
      if (enrollment.status !== "PENDING") {
        return NextResponse.json(
          { error: "Esta matrícula não pode ser paga", code: "INVALID_STATE" },
          { status: 409 },
        )
      }

      const token = await pmbMpAccessToken()
      if (!token) {
        return NextResponse.json(
          { error: "Pagamento PMB ainda não configurado", code: "MP_NOT_CONFIGURED" },
          { status: 503 },
        )
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")
      const reqHost =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host")
      const protocol = request.headers.get("x-forwarded-proto") ?? "https"
      const siteUrl = appUrl || (reqHost ? `${protocol}://${reqHost}` : "")

      const result = await processTransparentMpPayment(
        {
          id: enrollment.id,
          finalAmount: Number(enrollment.finalAmount),
          paymentType: enrollment.paymentType,
          installmentsTotal: enrollment.installmentsTotal,
          externalReference:
            enrollment.externalReference ?? `pmb_enr_${enrollment.id}`,
          courseNome: enrollment.course.nome,
          studentNome: enrollment.student.nome,
          studentEmail: enrollment.student.email,
          studentCpf: enrollment.student.cpf,
        },
        formData,
        {
          accessToken: token,
          fulfillTenant: {
            id: "__pmb__",
            slug: pmbPlataformaPolo(),
            name: PMB_PUBLIC_NAME,
            plataformaVendedorId: pmbPlataformaVendedorId(),
            isPmbVitrine: true,
          },
          // PMB: sem ?tenant= → o webhook resolve via buildPmbContext.
          notificationUrl: mpWebhookUrl(),
          subscriptionBackUrl: `${siteUrl}/checkout/confirmacao?enrollment_id=${enrollment.id}`,
        },
      )

      if (result.kind === "error") {
        return NextResponse.json(
          { error: result.error, code: result.code, statusDetail: result.statusDetail },
          { status: result.httpStatus },
        )
      }
      if (result.kind === "approved") {
        return NextResponse.json({ data: { status: result.status } })
      }
      return NextResponse.json({
        data: { status: "pending", pix: result.pix, boleto: result.boleto },
      })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "pmb.checkout.mp.process_failed", enrollmentId },
        "process MP transparente PMB falhou",
      )
      return NextResponse.json(
        { error: "Erro ao processar o pagamento", code: "INTERNAL_ERROR" },
        { status: 500 },
      )
    }
  },
)
