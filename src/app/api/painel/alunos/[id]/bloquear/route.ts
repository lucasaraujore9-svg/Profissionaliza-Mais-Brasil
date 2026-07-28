import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.block", route: "/api/painel/alunos/[id]/bloquear" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("alunos.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params
    const student = await prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId, ...ctx.scope.alunos },
      select: { id: true },
    })

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    try {
      await blockStudentInEA(student.id)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro na plataforma de aulas"
      return NextResponse.json(
        { error: `Falha ao bloquear acesso do aluno: ${message}` },
        { status: 502 },
      )
    }

    const updated = await prisma.student.findUnique({
      where: { id: student.id },
      select: { id: true, status: true, apostila: true },
    })

    return NextResponse.json({ data: updated })
  },
)
