import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { getHomeSectionsOptions } from "@/lib/home/options"

export const GET = withRequestContext(
  {
    action: "painel.home_sections.options",
    route: "/api/painel/home-sections/options",
  },
  async () => {
    const guard = await requirePainel("vitrine.view")
    if (!guard.ok) return guard.response
        return getHomeSectionsOptions()
  },
)
