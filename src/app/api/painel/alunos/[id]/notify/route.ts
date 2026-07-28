import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { notifySchema, notifyStudent } from "@/lib/students/management"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.notify", route: "/api/painel/alunos/[id]/notify" },
  async (request: Request, { params }) => {
    const guard = await requirePainel("alunos.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await params

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

    const student = await prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId, ...ctx.scope.alunos },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const notification = await notifyStudent(id, parsed.data)
    return NextResponse.json({ ok: true, notification })
  },
)
