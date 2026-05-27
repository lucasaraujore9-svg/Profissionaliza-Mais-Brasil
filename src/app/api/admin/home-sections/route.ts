import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { listSections, createSection } from "@/lib/home/api"

const SCOPE = { tenantId: null }

export const GET = withRequestContext(
  { action: "admin.home_sections.list", route: "/api/admin/home-sections" },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    return listSections(SCOPE)
  },
)

export const POST = withRequestContext(
  { action: "admin.home_sections.create", route: "/api/admin/home-sections" },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    const body = await request.json().catch(() => null)
    return createSection(SCOPE, body)
  },
)
