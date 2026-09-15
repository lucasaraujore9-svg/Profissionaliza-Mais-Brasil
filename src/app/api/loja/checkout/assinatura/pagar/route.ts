import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { storeSubscriptionPaymentSchema } from "@/lib/subscriptions/checkout-schema"
import { payStoreSubscription } from "@/lib/subscriptions/store-payment"
import { clientIp } from "@/lib/http/client-ip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Pagamento, na loja da unidade, de uma assinatura (página
 * `/pagar/assinatura/<id>`): venda direta, 1º ciclo ou renovação. A regra mora
 * em `payStoreSubscription`; aqui só entram tenant, corpo e rate limit.
 */
export const POST = withRequestContext(
  {
    action: "loja.checkout.assinatura.pagar",
    route: "/api/loja/checkout/assinatura/pagar",
  },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

    // O tenant vem do PROXY (host verificado), nunca do corpo — é o que impede
    // uma loja de cobrar a assinatura vendida por outra.
    const tenantIdHeader = request.headers.get("x-tenant-id")
    const tenantSlugHeader = request.headers.get("x-tenant-slug")
    if (!tenantIdHeader && !tenantSlugHeader) {
      return NextResponse.json(
        { error: "Loja não identificada", code: "TENANT_MISSING" },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findFirst({
      where: tenantIdHeader ? { id: tenantIdHeader } : { slug: tenantSlugHeader! },
      select: {
        id: true,
        slug: true,
        status: true,
        salesGateway: true,
        asaasApiKey: true,
        asaasWebhookToken: true,
        mpAccessToken: true,
        mpPublicKey: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Loja inválida", code: "TENANT_INVALID" },
        { status: 404 },
      )
    }
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Esta loja não está disponível no momento", code: "TENANT_INACTIVE" },
        { status: 403 },
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = storeSubscriptionPaymentSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const result = await payStoreSubscription(
      tenant,
      parsed.data,
      clientIp(request),
    )
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      )
    }
    return NextResponse.json({
      data: { authorized: result.authorized, pix: result.pix, boleto: result.boleto },
    })
  },
)
