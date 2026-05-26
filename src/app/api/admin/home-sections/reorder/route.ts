import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { reorderSections } from "@/lib/home/api"

const SCOPE = { tenantId: null }

export const PATCH = withRequestContext(
  {
    action: "admin.home_sections.reorder",
    route: "/api/admin/home-sections/reorder",
  },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    const body = await request.json().catch(() => null)
    return reorderSections(SCOPE, body)
  },
)
