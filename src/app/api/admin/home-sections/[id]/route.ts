import { NextResponse } from "next/server"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { updateSection, deleteSection } from "@/lib/home/api"
import { requireAdmin } from "@/lib/auth/admin-guard"

const SCOPE = { tenantId: null }

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.home_sections.update", route: "/api/admin/home-sections/[id]" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requireAdmin("vitrine.manage")
    if (!guard.ok) return guard.response
    const { id } = await params
    const body = await request.json().catch(() => null)
    return updateSection(SCOPE, id, body)
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.home_sections.delete", route: "/api/admin/home-sections/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requireAdmin("vitrine.manage")
    if (!guard.ok) return guard.response
    const { id } = await params
    return deleteSection(SCOPE, id)
  },
)

// Reservado pro caso de adicionar mais verbs no futuro; evita warning unused
void NextResponse
