import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"

// POST /api/admin/alunos/[id]/impersonate — SUPER_ADMIN acessa a área do aluno
// como o aluno (mesmas telas que ele vê). Privilégio crítico → só SUPER_ADMIN.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.impersonate", route: "/api/admin/alunos/[id]/impersonate" },
  async (_request: Request, { params }) => {
    const guard = await requireAdmin("alunos.impersonate")
    if (!guard.ok) return guard.response
    const admin = guard.ctx
    const { id: studentId } = await params
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, nome: true, email: true, tenantId: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    // A sessão de aluno exige e-mail (requireStudentSession). Sem e-mail não há
    // como montar uma sessão válida.
    if (!student.email) {
      return NextResponse.json(
        { error: "Aluno sem e-mail cadastrado — não é possível acessar como ele." },
        { status: 400 },
      )
    }

    await startImpersonation({
      target: {
        sub: student.id,
        role: "STUDENT",
        tenantId: student.tenantId,
        studentId: student.id,
        email: student.email,
        name: student.nome,
      },
      actor: { userId: admin.userId, name: admin.name, email: admin.email },
      targetLabel: student.nome,
    })

    await logAudit({
      action: "impersonation.start",
      resource: "Student",
      resourceId: student.id,
      actorUserId: admin.userId,
      actorRole: admin.role,
      actorEmail: admin.email,
      tenantId: student.tenantId,
      payloadAfter: { targetStudentId: student.id },
    })

    return NextResponse.json({ data: { redirect: "/aluno" } })
  },
)
