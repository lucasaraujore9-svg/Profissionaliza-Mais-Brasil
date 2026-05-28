import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbTeam } from "@/lib/auth/guards"
import { notifySchema, notifyStudent } from "@/lib/students/management"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.notify", route: "/api/admin/alunos/[id]/notify" },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = notifySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const notification = await notifyStudent(id, parsed.data)
    return NextResponse.json({ ok: true, notification })
  },
)
