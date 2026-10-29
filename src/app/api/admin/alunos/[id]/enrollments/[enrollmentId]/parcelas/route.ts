import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminAny, type AdminContext } from "@/lib/auth/admin-guard"
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
 * Mesma matriz das rotas irmãs (cancelar, verificar-pagamento) — a matrícula
 * tem dois donos possíveis:
 *
 *   tenantId === null  -> venda da vitrine PMB: `alunos.*`, e sem
 *                         `alunos.viewAll` só o que a pessoa vendeu.
 *   tenantId != null   -> aluno de uma unidade: `unidades.*` E a unidade no
 *                         escopo do ator (`canAccessTenant`).
 */
async function canReach(
  ctx: AdminContext,
  enrollment: { tenantId: string | null; soldByUserId: string | null },
  mode: "view" | "manage",
): Promise<boolean> {
  if (enrollment.tenantId === null) {
    if (!ctx.can(`alunos.${mode}`)) return false
    return ctx.can("alunos.viewAll") || enrollment.soldByUserId === ctx.userId
  }
  if (!ctx.can(`unidades.${mode}`)) return false
  const tenant = await prisma.tenant.findUnique({
    where: { id: enrollment.tenantId },
    select: { accountManagerId: true, salesUserId: true },
  })
  return ctx.canAccessTenant(tenant)
}

async function findEnrollment(studentId: string, enrollmentId: string) {
  return prisma.enrollment.findFirst({
    where: { id: enrollmentId, studentId },
    select: { id: true, tenantId: true, soldByUserId: true },
  })
}

/** GET — parcelas do carnê desta matrícula. */
export const GET = withRequestContextParams<Params>(
  {
    action: "admin.alunos.enrollments.parcelas.list",
    route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/parcelas",
  },
  async (_request: Request, ctx) => {
    const guard = await requireAdminAny("alunos.view", "unidades.view")
    if (!guard.ok) return guard.response
    const { id, enrollmentId } = await ctx.params
    const enrollment = await findEnrollment(id, enrollmentId)
    // 404 (e não 403) fora do escopo: não revela alunos de unidades alheias.
    if (!enrollment || !(await canReach(guard.ctx, enrollment, "view"))) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ data: await listEnrollmentInstallments(enrollment.id) })
  },
)

/** PATCH — renegocia UMA parcela em aberto (valor e/ou vencimento). */
export const PATCH = withRequestContextParams<Params>(
  {
    action: "admin.alunos.enrollments.parcelas.edit",
    route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/parcelas",
  },
  async (request: Request, ctx) => {
    const guard = await requireAdminAny("alunos.manage", "unidades.manage")
    if (!guard.ok) return guard.response

    const parsed = editInstallmentSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      )
    }

    const { id: studentId, enrollmentId } = await ctx.params
    const enrollment = await findEnrollment(studentId, enrollmentId)
    if (!enrollment || !(await canReach(guard.ctx, enrollment, "manage"))) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    try {
      const result = await editBoletoInstallment({ enrollmentId: enrollment.id, ...parsed.data })
      await logAudit({
        action: "enrollment.installment.edit",
        resource: "BoletoInstallment",
        resourceId: parsed.data.installmentId,
        actorUserId: guard.ctx.userId,
        actorRole: guard.ctx.role,
        tenantId: enrollment.tenantId,
        payloadBefore: { enrollmentId, studentId, ...result.before },
        payloadAfter: { enrollmentId, studentId, ...result.after },
      })
      return NextResponse.json({ data: result })
    } catch (err) {
      const known = installmentEditErrorStatus(err)
      if (known) return NextResponse.json({ error: known.error }, { status: known.status })
      contextLogger().error(
        { err, event: "admin.alunos.parcelas.edit_failed", enrollmentId },
        "edição de parcela falhou",
      )
      return NextResponse.json({ error: "Falha ao alterar a parcela." }, { status: 500 })
    }
  },
)
