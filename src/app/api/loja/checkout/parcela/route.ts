import { NextResponse } from "next/server"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { rejectBot } from "@/lib/checkout/bot-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { flexPayResponse, lojaTenantId } from "@/lib/installments/flex-pay"

// Paga a linha da vez do parcelado na loja da unidade (tenant pelo proxy).
export const POST = withRequestContext(
  { action: "loja.checkout.parcela", route: "/api/loja/checkout/parcela" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)
    const bot = await rejectBot(request, "consume")
    if (bot) return bot

    const tenantId = await lojaTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: "Loja não identificada", code: "TENANT_MISSING" }, { status: 400 })
    }
    return flexPayResponse(request, tenantId)
  },
)
