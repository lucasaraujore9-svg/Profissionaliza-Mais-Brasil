import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { unblockStudentInEA } from "@/lib/students/plataforma-actions"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.unblock", route: "/api/admin/alunos/[id]/desbloquear" },
  async (_request: Request, { params }) => {
  const guard = await requireAdmin("alunosRede.acesso")
  if (!guard.ok) return guard.response
  const { id } = await params
  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  try {
    await unblockStudentInEA(student.id)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro na plataforma de aulas"
    return NextResponse.json(
      { error: `Falha ao desbloquear: ${message}` },
      { status: 502 },
    )
  }

  await prisma.enrollment.updateMany({
    where: { studentId: student.id, status: "SUSPENDED" },
    data: { status: "ACTIVE" },
  })

  const updated = await prisma.student.findUnique({
    where: { id: student.id },
    select: { id: true, status: true, apostila: true },
  })
  return NextResponse.json({ data: updated })
  },
)
