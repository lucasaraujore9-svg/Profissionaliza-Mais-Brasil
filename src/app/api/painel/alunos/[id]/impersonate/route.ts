import { NextResponse } from "next/server"
import { requirePainel } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

// POST /api/painel/alunos/[id]/impersonate — o dono da revenda acessa a área do
// aluno como um aluno DELE (suporte). Escopado: só alunos do próprio tenant.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.impersonate", route: "/api/painel/alunos/[id]/impersonate" },
  async (_request: Request, { params }) => {
    // Acessar a área do aluno como ele é privilégio à parte: fora de todos os
    // presets da equipe, concedido caso a caso pelo dono em /painel/equipe.
    const guard = await requirePainel("alunos.impersonate")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const tenantId = ctx.tenantId
    const userId = ctx.userId

    const { id: studentId } = await params
    // Escopo do papel: quem não tem `alunos.viewAll` só alcança os próprios
    // alunos — impersonar por ID direto não fura essa fronteira.
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId, ...ctx.scope.alunos },
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
