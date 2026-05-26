import { NextResponse } from "next/server"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { getHomeSectionsOptions } from "@/lib/home/options"

export const GET = withRequestContext(
  {
    action: "painel.home_sections.options",
    route: "/api/painel/home-sections/options",
  },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    return getHomeSectionsOptions()
  },
)
