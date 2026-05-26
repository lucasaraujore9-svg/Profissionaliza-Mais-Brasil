import { NextResponse } from "next/server"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { listSections, createSection } from "@/lib/home/api"
import { ensureTenantHomeSections } from "@/lib/home/sections"

export const GET = withRequestContext(
  { action: "painel.home_sections.list", route: "/api/painel/home-sections" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    // Bootstrap: se o tenant ainda nao tem secoes proprias, clona as do PMB.
    await ensureTenantHomeSections(ctx.tenantId)
    return listSections({ tenantId: ctx.tenantId })
  },
)

export const POST = withRequestContext(
  { action: "painel.home_sections.create", route: "/api/painel/home-sections" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    return createSection({ tenantId: ctx.tenantId }, body)
  },
)
