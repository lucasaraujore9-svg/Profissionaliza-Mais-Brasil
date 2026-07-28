import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { updateSection, deleteSection } from "@/lib/home/api"

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.home_sections.update", route: "/api/painel/home-sections/[id]" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await params
    const body = await request.json().catch(() => null)
    return updateSection({ tenantId: ctx.tenantId }, id, body)
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.home_sections.delete", route: "/api/painel/home-sections/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await params
    return deleteSection({ tenantId: ctx.tenantId }, id)
  },
)
