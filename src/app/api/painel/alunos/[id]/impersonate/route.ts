import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

// POST /api/painel/alunos/[id]/impersonate — o dono da revenda acessa a área do
// aluno como um aluno DELE (suporte). Escopado: só alunos do próprio tenant.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.impersonate", route: "/api/painel/alunos/[id]/impersonate" },
  async (_request: Request, { params }) => {
    const session = await auth()
    const user = session?.user as
      | { id?: string; role?: string; tenantId?: string | null }
      | undefined
    if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
      return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
    }
    const tenantId = user.tenantId
    const userId = user.id

    // Owner DIRETO do tenant (consultor não impersona alunos).
    const owner = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    })
    if (!owner) {
      return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
    }

    const { id: studentId } = await params
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, nome: true, email: true, tenantId: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
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
      actor: { userId },
      targetLabel: student.nome,
    })

    await logAudit({
      action: "impersonation.start",
      resource: "Student",
      resourceId: student.id,
      actorUserId: userId,
      actorRole: "RESELLER",
      tenantId: student.tenantId,
      payloadAfter: { targetStudentId: student.id, via: "reseller_owner" },
    })

    return NextResponse.json({ data: { redirect: "/aluno" } })
  },
)
