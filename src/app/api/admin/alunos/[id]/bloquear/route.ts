import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.block", route: "/api/admin/alunos/[id]/bloquear" },
  async (_request: Request, { params }) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode bloquear alunos" },
      { status: 403 },
    )
  }

  const { id } = await params
  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, status: true, tenantId: true },
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
      { error: `Falha ao bloquear: ${message}` },
      { status: 502 },
    )
  }

  // Suspende matriculas ativas para refletir o bloqueio na linha do tempo
  await prisma.enrollment.updateMany({
    where: { studentId: student.id, status: "ACTIVE" },
    data: { status: "SUSPENDED" },
  })

  const updated = await prisma.student.findUnique({
    where: { id: student.id },
    select: { id: true, status: true, apostila: true },
  })

  await logAudit({
    action: "student.block",
    resource: "Student",
    resourceId: student.id,
    actorUserId: session.userId,
    actorRole: session.role,
    actorEmail: session.email,
    tenantId: student.tenantId,
    payloadBefore: { status: student.status },
    payloadAfter: { status: updated?.status ?? "BLOQUEADO" },
  })

  return NextResponse.json({ data: updated })
  },
)
