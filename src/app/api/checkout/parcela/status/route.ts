import { NextResponse } from "next/server"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { flexRowStatusResponse } from "@/lib/installments/flex-pay"

// Polling da linha do parcelado da vitrine PMB (tenantId null).
export const GET = withRequestContext(
  { action: "pmb.checkout.parcela.status", route: "/api/checkout/parcela/status" },
  async (request: Request) => {
    if (!isPmbAppHost(request.headers.get("host"))) {
      return NextResponse.json({ error: "Checkout indisponível neste domínio", code: "WRONG_HOST" }, { status: 404 })
    }
    return flexRowStatusResponse(request, null)
  },
)

export const dynamic = "force-dynamic"
