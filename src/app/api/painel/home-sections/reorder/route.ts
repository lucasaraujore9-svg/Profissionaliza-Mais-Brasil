import { NextResponse } from "next/server"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { reorderSections } from "@/lib/home/api"

export const PATCH = withRequestContext(
  {
    action: "painel.home_sections.reorder",
    route: "/api/painel/home-sections/reorder",
  },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    return reorderSections({ tenantId: ctx.tenantId }, body)
  },
)
