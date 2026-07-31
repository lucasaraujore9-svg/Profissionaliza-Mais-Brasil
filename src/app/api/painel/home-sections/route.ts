import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { listSections, createSection } from "@/lib/home/api"
import { ensureTenantHomeSections } from "@/lib/home/sections"

export const GET = withRequestContext(
  { action: "painel.home_sections.list", route: "/api/painel/home-sections" },
  async () => {
    const guard = await requirePainel("vitrine.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    // Bootstrap: se o tenant ainda nao tem secoes proprias, clona as do PMB.
    await ensureTenantHomeSections(ctx.tenantId)
    return listSections({ tenantId: ctx.tenantId })
  },
)

export const POST = withRequestContext(
  { action: "painel.home_sections.create", route: "/api/painel/home-sections" },
  async (request: Request) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const body = await request.json().catch(() => null)
    return createSection({ tenantId: ctx.tenantId }, body)
  },
)
