import { NextResponse } from "next/server"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { flexRowStatusResponse, lojaTenantId } from "@/lib/installments/flex-pay"

// Polling da linha do parcelado na loja, escopado ao tenant do proxy (IDOR).
export const GET = withRequestContext(
  { action: "loja.checkout.parcela.status", route: "/api/loja/checkout/parcela/status" },
  async (request: Request) => {
    const tenantId = await lojaTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: "Loja não identificada", code: "TENANT_MISSING" }, { status: 400 })
    }
    return flexRowStatusResponse(request, tenantId)
  },
)

export const dynamic = "force-dynamic"
