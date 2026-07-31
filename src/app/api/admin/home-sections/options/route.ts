import { withRequestContext } from "@/lib/observability/with-request-context"
import { getHomeSectionsOptions } from "@/lib/home/options"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  {
    action: "admin.home_sections.options",
    route: "/api/admin/home-sections/options",
  },
  async () => {
    const guard = await requireAdmin("vitrine.view")
    if (!guard.ok) return guard.response
    return getHomeSectionsOptions()
  },
)
