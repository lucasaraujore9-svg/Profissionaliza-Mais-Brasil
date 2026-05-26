import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { getHomeSectionsOptions } from "@/lib/home/options"

export const GET = withRequestContext(
  {
    action: "admin.home_sections.options",
    route: "/api/admin/home-sections/options",
  },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    return getHomeSectionsOptions()
  },
)
