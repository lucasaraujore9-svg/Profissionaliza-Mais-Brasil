import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel, type PainelContext } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"
import {
  editBoletoInstallment,
  editInstallmentSchema,
  installmentEditErrorStatus,
  listEnrollmentInstallments,
} from "@/lib/installments/edit"

type Params = { id: string; enrollmentId: string }

/**
 * Isolamento pelos dois lados: o aluno é da unidade logada (e da carteira de
 * quem pediu) e a matrícula é do mesmo aluno E da mesma unidade.
 */
async function findEnrollment(session: PainelContext, studentId: string, enrollmentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId, ...session.scope.alunos },
    select: { id: true },
  })
  if (!student) return null
  return prisma.enrollment.findFirst({
    where: { id: enrollmentId, studentId, tenantId: session.tenantId },
    select: { id: true },
  })
}

/** GET — parcelas do carnê desta matrícula. */
export const GET = withRequestContextParams<Params>(
  {
    action: "painel.alunos.enrollments.parcelas.list",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/parcelas",
  },
  async (_request: Request, ctx) => {
    const guard = await requirePainel("alunos.view")
    if (!guard.ok) return guard.response
    const { id, enrollmentId } = await ctx.params
    const enrollment = await findEnrollment(guard.ctx, id, enrollmentId)
    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ data: await listEnrollmentInstallments(enrollment.id) })
  },
)

/**
 * PATCH — renegocia UMA parcela em aberto (valor e/ou vencimento).
 *
 * Exige `alunos.manage` E `vendas.create`: mexer no valor é decisão comercial
 * — a Secretaria cuida do cadastro do aluno, mas não de preço.
 */
export const PATCH = withRequestContextParams<Params>(
  {
    action: "painel.alunos.enrollments.parcelas.edit",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/parcelas",
  },
  async (request: Request, ctx) => {
    const guard = await requirePainel("alunos.manage")
    if (!guard.ok) return guard.response
    const session = guard.ctx
    if (!session.can("vendas.create")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const parsed = editInstallmentSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      )
    }

    const { id: studentId, enrollmentId } = await ctx.params
    const enrollment = await findEnrollment(session, studentId, enrollmentId)
    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    try {
      const result = await editBoletoInstallment({ enrollmentId: enrollment.id, ...parsed.data })
      await logAudit({
        action: "enrollment.installment.edit",
        resource: "BoletoInstallment",
        resourceId: parsed.data.installmentId,
        actorUserId: session.userId,
        actorRole: "RESELLER",
        tenantId: session.tenantId,
        payloadBefore: { enrollmentId, studentId, ...result.before },
        payloadAfter: { enrollmentId, studentId, ...result.after },
      })
      return NextResponse.json({ data: result })
    } catch (err) {
      const known = installmentEditErrorStatus(err)
      if (known) return NextResponse.json({ error: known.error }, { status: known.status })
      contextLogger().error(
        { err, event: "painel.alunos.parcelas.edit_failed", enrollmentId },
        "edição de parcela falhou",
      )
      return NextResponse.json({ error: "Falha ao alterar a parcela." }, { status: 500 })
    }
  },
)

