import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { listSections, createSection } from "@/lib/home/api"
import {
  ensureTecnicaSection,
  ensureEjaSection,
  ensureIdiomasSection,
} from "@/lib/home/sections"

const SCOPE = { tenantId: null }

export const GET = withRequestContext(
  { action: "admin.home_sections.list", route: "/api/admin/home-sections" },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    // Backfill: garante as seções singleton para ambientes/escopos anteriores a elas.
    await ensureTecnicaSection(null)
    await ensureEjaSection(null)
    await ensureIdiomasSection(null)
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
