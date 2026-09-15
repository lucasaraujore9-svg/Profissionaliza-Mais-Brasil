import { NextResponse } from "next/server"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { storeSubscriptionPaymentSchema } from "@/lib/subscriptions/checkout-schema"
import { payStoreSubscription } from "@/lib/subscriptions/store-payment"
import { clientIp } from "@/lib/http/client-ip"
import { isPmbAppHost } from "@/lib/tenant/urls"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Pagamento de uma assinatura da VITRINE PMB na página da plataforma
 * (`(main)/pagar/assinatura/<id>`): venda direta do /admin, 1º ciclo ou
 * renovação. Contraparte de `/api/loja/checkout/assinatura/pagar`; aqui a conta
 * que recebe é a conta-mãe, e `payStoreSubscription(null, …)` só enxerga
 * assinaturas com `tenantId` null — nunca a de uma unidade.
 */
export const POST = withRequestContext(
  { action: "checkout.assinatura.pagar", route: "/api/checkout/assinatura/pagar" },
  async (request: Request) => {
    // Cobra na conta da PMB: só a partir do domínio da PMB, como o checkout
    // de retomada da venda de curso.
    if (!isPmbAppHost(request.headers.get("host"))) {
      return NextResponse.json(
        { error: "Checkout indisponível neste domínio", code: "WRONG_HOST" },
        { status: 404 },
      )
    }

    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

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

    const result = await payStoreSubscription(null, parsed.data, clientIp(request))
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
