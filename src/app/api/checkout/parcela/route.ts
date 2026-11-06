import { NextResponse } from "next/server"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { rejectBot } from "@/lib/checkout/bot-guard"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { flexPayResponse } from "@/lib/installments/flex-pay"

// Paga a linha da vez do parcelado da vitrine PMB (tenantId null).
export const POST = withRequestContext(
  { action: "pmb.checkout.parcela", route: "/api/checkout/parcela" },
  async (request: Request) => {
    if (!isPmbAppHost(request.headers.get("host"))) {
      return NextResponse.json({ error: "Checkout indisponível neste domínio", code: "WRONG_HOST" }, { status: 404 })
    }
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)
    const bot = await rejectBot(request, "consume")
    if (bot) return bot

    return flexPayResponse(request, null)
  },
)
