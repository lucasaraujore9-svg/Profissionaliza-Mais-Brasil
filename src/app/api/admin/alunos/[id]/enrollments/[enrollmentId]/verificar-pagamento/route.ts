import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminAny, type AdminContext } from "@/lib/auth/admin-guard"
import { reconcilePendingEnrollment } from "@/lib/mercadopago/process"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"

/**
 * Autorização para verificar/efetivar o pagamento de QUALQUER aluno. Mesma
 * matriz da rota irmã de cancelamento — a matrícula tem dois donos possíveis:
 *
 *   tenantId === null  -> venda da vitrine PMB: exige `alunos.manage`, e sem
 *                         `alunos.viewAll` só alcança o que a pessoa vendeu.
 *   tenantId != null   -> aluno de uma unidade: exige `unidades.manage` E que a
 *                         unidade esteja no escopo do ator (`canAccessTenant`).
 */
async function canVerify(
  ctx: AdminContext,
  enrollment: { tenantId: string | null; soldByUserId: string | null },
): Promise<boolean> {
  if (enrollment.tenantId === null) {
    if (!ctx.can("alunos.manage")) return false
    return ctx.can("alunos.viewAll") || enrollment.soldByUserId === ctx.userId
  }

  if (!ctx.can("unidades.manage")) return false

  const tenant = await prisma.tenant.findUnique({
    where: { id: enrollment.tenantId },
    select: { accountManagerId: true, salesUserId: true },
  })
  return ctx.canAccessTenant(tenant)
}

/**
 * POST /api/admin/alunos/[id]/enrollments/[enrollmentId]/verificar-pagamento
 *
 * Versão da rede do "verificar pagamento" da unidade: consulta o gateway DONO
 * da venda (conta da unidade, ou a conta-mãe quando a venda é da vitrine PMB) e
 * efetiva a matrícula se o pagamento estiver confirmado lá.
 *
 * Existe porque o suporte da PMB precisa destravar a venda de uma unidade sem
 * depender do webhook dela — que é configurado na conta do gateway da unidade,
 * fora do nosso alcance. O `/api/admin/vendas/[id]/sync-payment` NÃO cobre esse
 * caso: aquele filtra `tenantId: null` (só venda direta da PMB).
 */
export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "admin.alunos.enrollments.verify_payment",
    route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/verificar-pagamento",
  },
  async (_request: Request, ctx) => {
    const guard = await requireAdminAny("alunos.manage", "unidades.manage")
    if (!guard.ok) return guard.response

    const { id: studentId, enrollmentId } = await ctx.params

    const rl = await rateLimitByKey(
      guard.ctx.userId,
      RATE_LIMITS.gestaoVerificarPagamento,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId },
      select: {
        id: true,
        status: true,
        gateway: true,
        tenantId: true,
        soldByUserId: true,
      },
    })
    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    if (!(await canVerify(guard.ctx, enrollment))) {
      // 404 (e não 403) fora do escopo: não revela a existência de alunos de
      // unidades que o ator não gerencia. Mesma escolha da rota de cancelamento.
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
      return NextResponse.json({
        data: { status: "confirmed", alreadyProcessed: true },
      })
    }
    // SUSPENDED entra: cobrança vencida paga depois continua liquidável no
    // gateway. CANCELLED não — a venda foi desfeita.
    if (enrollment.status !== "PENDING" && enrollment.status !== "SUSPENDED") {
      return NextResponse.json(
        { error: "Esta matrícula não tem cobrança em aberto para verificar" },
        { status: 409 },
      )
    }

    let result
    try {
      result = await reconcilePendingEnrollment(enrollment.id)
    } catch (err) {
      contextLogger().error(
        {
          err,
          event: "admin.alunos.verify_payment.failed",
          enrollmentId: enrollment.id,
          gateway: enrollment.gateway,
          tenantId: enrollment.tenantId,
        },
        "verificação de pagamento falhou",
      )
      return NextResponse.json(
        {
          error:
            "Não foi possível consultar o gateway agora. Tente novamente em alguns minutos.",
          code: "GATEWAY_UNAVAILABLE",
        },
        { status: 502 },
      )
    }

    if (result.status === "confirmed") {
      await logAudit({
        action: "enrollment.payment.verify",
        resource: "Enrollment",
        resourceId: enrollment.id,
        actorUserId: guard.ctx.userId,
        actorRole: guard.ctx.role,
        tenantId: enrollment.tenantId,
        payloadAfter: {
          studentId,
          gateway: enrollment.gateway,
          previousStatus: enrollment.status,
          outcome: "confirmed",
        },
      })
    }

    return NextResponse.json({ data: result })
  },
)
