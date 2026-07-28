import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { reorderSections } from "@/lib/home/api"

export const PATCH = withRequestContext(
  {
    action: "painel.home_sections.reorder",
    route: "/api/painel/home-sections/reorder",
  },
  async (request: Request) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const body = await request.json().catch(() => null)
    return reorderSections({ tenantId: ctx.tenantId }, body)
  },
)
