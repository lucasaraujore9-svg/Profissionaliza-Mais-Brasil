import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const toggleSchema = z.object({
  isVisible: z.boolean(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.cursos.visibility", route: "/api/painel/cursos/[id]/visibility" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("catalogo.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params
    const tc = await prisma.tenantCourse.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, isVisible: true },
    })

    if (!tc) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    let payload: unknown = null
    try {
      payload = await request.json()
    } catch {
      payload = null
    }

    const parsed = toggleSchema.safeParse(payload)
    const nextValue = parsed.success ? parsed.data.isVisible : !tc.isVisible

    const updated = await prisma.tenantCourse.update({
      where: { id },
      data: { isVisible: nextValue },
      select: { id: true, isVisible: true },
    })

    return NextResponse.json({ data: updated })
  },
)
