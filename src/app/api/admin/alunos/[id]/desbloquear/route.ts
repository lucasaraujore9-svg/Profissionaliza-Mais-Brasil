import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { unblockStudentInEA } from "@/lib/students/ea-actions"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode desbloquear alunos" },
      { status: 403 },
    )
  }

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
}
