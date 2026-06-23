import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"

// POST /api/admin/alunos/[id]/impersonate — SUPER_ADMIN acessa a área do aluno
// como o aluno (mesmas telas que ele vê). Privilégio crítico → só SUPER_ADMIN.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.impersonate", route: "/api/admin/alunos/[id]/impersonate" },
  async (_request: Request, { params }) => {
    const admin = await requireAdminSession()
    if (!admin) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (admin.role !== "SUPER_ADMIN") {
      contextLogger().warn(
        { event: "impersonate.denied", actorId: admin.userId, actorRole: admin.role },
        "tentativa de impersonate de aluno por papel não-SUPER_ADMIN",
      )
      return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
    }

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
