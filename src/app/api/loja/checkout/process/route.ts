import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { decryptTenantMpToken } from "@/lib/mercadopago/client"
import {
  processTransparentMpPayment,
  transparentFormDataSchema,
} from "@/lib/mercadopago/transparent-process"
import { decryptTenantAsaasKey } from "@/lib/asaas/client"
import {
  processTransparentAsaasPayment,
  asaasFormDataSchema,
} from "@/lib/asaas/transparent-process"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { mpWebhookUrl, asaasWebhookUrl, vitrineUrl } from "@/lib/tenant/urls"

// O formData varia por gateway (MP tokeniza no browser; Asaas envia o cartão ao
// servidor). Aceitamos os dois shapes e ramificamos pelo enrollment.gateway.
const bodySchema = z.object({
  enrollmentId: z.string().min(1),
  formData: z.union([transparentFormDataSchema, asaasFormDataSchema]),
})

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
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          status: true,
          tenantId: true,
          gateway: true,
          paymentType: true,
          finalAmount: true,
          installmentsTotal: true,
          externalReference: true,
          asaasCustomerId: true,
          course: { select: { nome: true } },
          student: { select: { nome: true, email: true, cpf: true, fone: true } },
          tenant: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              mpAccessToken: true,
              plataformaVendedorId: true,
              asaasApiKey: true,
              asaasWebhookToken: true,
              asaasGatewayEnabled: true,
              asaasConnected: true,
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
      if (tenant.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Loja indisponível para pagamento", code: "TENANT_INACTIVE" },
          { status: 403 },
        )
      }

      const reqHost =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host")
      const protocol = request.headers.get("x-forwarded-proto") ?? "https"
      const storeUrl = reqHost
        ? `${protocol}://${reqHost}`
        : vitrineUrl(tenantSlug ?? tenant.slug)

      // ── Asaas: conta própria da unidade (cartão vai ao servidor) ────────────
      if (enrollment.gateway === "ASAAS") {
        if (
          !tenant.asaasGatewayEnabled ||
          !tenant.asaasConnected ||
          !tenant.asaasApiKey
        ) {
          return NextResponse.json(
            { error: "Loja indisponível para pagamento", code: "TENANT_INACTIVE" },
            { status: 403 },
          )
        }
        const asaasParsed = asaasFormDataSchema.safeParse(formData)
        if (!asaasParsed.success) {
          return NextResponse.json(
            { error: "Dados de pagamento inválidos", code: "VALIDATION_ERROR" },
            { status: 400 },
          )
        }
        // IP do comprador (Asaas exige no cartão). Primeiro IP do x-forwarded-for;
        // cai no x-real-ip se ausente — mesmo critério do clientIp() provado em
        // /api/cobranca/[paymentId]/pay-card. O 0.0.0.0 final fica no client Asaas.
        const fwd =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip")?.trim() ||
          null

        const asaasResult = await processTransparentAsaasPayment(
          {
            id: enrollment.id,
            finalAmount: Number(enrollment.finalAmount),
            paymentType: enrollment.paymentType,
            installmentsTotal: enrollment.installmentsTotal,
            externalReference: enrollment.externalReference ?? `enr_${enrollment.id}`,
            courseNome: enrollment.course.nome,
            studentNome: enrollment.student.nome,
            studentEmail: enrollment.student.email,
            studentCpf: enrollment.student.cpf,
            studentFone: enrollment.student.fone,
            asaasCustomerId: enrollment.asaasCustomerId,
          },
          asaasParsed.data,
          {
            apiKey: decryptTenantAsaasKey(tenant.asaasApiKey),
            fulfillTenant: {
              id: tenant.id,
              slug: tenant.slug,
              name: tenant.name,
              plataformaVendedorId: tenant.plataformaVendedorId,
            },
            notificationUrl: asaasWebhookUrl(tenant.slug),
            remoteIp: fwd,
          },
        )

        if (asaasResult.kind === "error") {
          return NextResponse.json(
            { error: asaasResult.error, code: asaasResult.code, statusDetail: asaasResult.statusDetail },
            { status: asaasResult.httpStatus },
          )
        }
        if (asaasResult.kind === "approved") {
          return NextResponse.json({ data: { status: asaasResult.status } })
        }
        return NextResponse.json({
          data: { status: "pending", pix: asaasResult.pix, boleto: asaasResult.boleto },
        })
      }

      // ── Mercado Pago (padrão): cartão tokenizado no browser ─────────────────
      if (!tenant.mpAccessToken) {
        return NextResponse.json(
          { error: "Loja indisponível para pagamento", code: "TENANT_INACTIVE" },
          { status: 403 },
        )
      }
      const mpParsed = transparentFormDataSchema.safeParse(formData)
      if (!mpParsed.success) {
        return NextResponse.json(
          { error: "Dados de pagamento inválidos", code: "VALIDATION_ERROR" },
          { status: 400 },
        )
      }

      const result = await processTransparentMpPayment(
        {
          id: enrollment.id,
          finalAmount: Number(enrollment.finalAmount),
          paymentType: enrollment.paymentType,
          installmentsTotal: enrollment.installmentsTotal,
          externalReference: enrollment.externalReference ?? `enr_${enrollment.id}`,
          courseNome: enrollment.course.nome,
          studentNome: enrollment.student.nome,
          studentEmail: enrollment.student.email,
          studentCpf: enrollment.student.cpf,
        },
        mpParsed.data,
        {
          accessToken: decryptTenantMpToken(tenant.mpAccessToken),
          fulfillTenant: {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            plataformaVendedorId: tenant.plataformaVendedorId,
            isPmbVitrine: false,
          },
          notificationUrl: mpWebhookUrl(tenantSlug),
          subscriptionBackUrl: `${storeUrl}/loja/confirmacao?enrollment_id=${enrollment.id}`,
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
