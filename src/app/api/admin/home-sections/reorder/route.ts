import { withRequestContext } from "@/lib/observability/with-request-context"
import { reorderSections } from "@/lib/home/api"
import { requireAdmin } from "@/lib/auth/admin-guard"

const SCOPE = { tenantId: null }

export const PATCH = withRequestContext(
  {
    action: "admin.home_sections.reorder",
    route: "/api/admin/home-sections/reorder",
  },
  async (request: Request) => {
    const guard = await requireAdmin("vitrine.manage")
    if (!guard.ok) return guard.response
    const body = await request.json().catch(() => null)
    return reorderSections(SCOPE, body)
  },
)
