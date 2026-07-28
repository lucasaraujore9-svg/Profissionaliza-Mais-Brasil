import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { refundPayment as refundAsaasPayment } from "@/lib/asaas/client"
import { refundPayment as refundMpPayment } from "@/lib/mercadopago/client"
import {
  cancelEnrollment,
  isCancellableEnrollmentStatus,
} from "@/lib/enrollment/cancel"
import { resolveEnrollmentGatewayKeys } from "@/lib/enrollment/gateway-credentials"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { requireAdminAny, type AdminContext } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  // `removeFromEA` é o nome legado (UI de /admin/vendas/alunos); `removeAccess`
  // é o nome usado pela gestão de alunos compartilhada. Ambos valem.
  removeFromEA: z.boolean().optional(),
  removeAccess: z.boolean().optional(),
  // Estorno opcional ao aluno (CDC art. 49: cliente pode desistir em até 7
  // dias da compra online). Não exposto na UI — só via API, para suporte.
  // Default false pra não estornar acidentalmente.
  refund: z.boolean().optional().default(false),
  refundReason: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
})

/**
 * Autorização para cancelar a matrícula de QUALQUER aluno. A matrícula tem dois
 * donos possíveis e cada um responde a uma permissão diferente:
 *
 *   tenantId === null  -> venda da vitrine PMB: exige `alunos.manage`, e sem
 *                         `alunos.viewAll` só alcança o que a pessoa vendeu.
 *   tenantId != null   -> aluno de uma unidade: exige `unidades.manage` E que a
 *                         unidade esteja no escopo do ator (`canAccessTenant`).
 *
 * TIGHTENING deliberado em relação ao guard anterior (`requirePmbTeam` + papel):
 * o comercial de revenda (PMB_REVENDA_SALES / PMB_SALES_MGR) passava aqui e
 * podia cancelar — com estorno — a matrícula de um aluno da unidade que ele
 * vendeu. Cancelar é ação de suporte, não de venda; ficou com quem administra a
 * unidade. O super admin pode devolver caso a caso por permissão avançada.
 */
async function canCancel(
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

export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "admin.alunos.enrollments.cancel",
    route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar",
  },
  async (request: Request, ctx) => {
    const guard = await requireAdminAny("alunos.manage", "unidades.manage")
    if (!guard.ok) return guard.response

    const { id: studentId, enrollmentId } = await ctx.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      payload = {}
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
    }
    const { refund, refundReason, reason } = parsed.data
    const removeAccess = parsed.data.removeAccess ?? parsed.data.removeFromEA ?? false

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId },
      select: {
        id: true,
        tenantId: true,
        soldByUserId: true,
        status: true,
      },
    })

    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    if (!(await canCancel(guard.ctx, enrollment))) {
      // 404 (e não 403) quando a matrícula está fora do escopo do ator: não
      // revela a existência de alunos de unidades que ele não gerencia.
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    if (enrollment.status === "CANCELLED") {
      return NextResponse.json({ error: "Matrícula já está cancelada" }, { status: 409 })
    }
    if (!isCancellableEnrollmentStatus(enrollment.status)) {
      return NextResponse.json(
        { error: "Curso já concluído — não é possível cancelar" },
        { status: 409 },
      )
    }

    // Estorno (opcional, só via API). Roda ANTES do cancelamento para que uma
    // falha no gateway ainda deixe a matrícula no estado original, permitindo
    // repetir a operação inteira.
    const refundErrors: string[] = []
    let refundedCount = 0
    if (refund) {
      const keys = await resolveEnrollmentGatewayKeys(enrollment)
      const payments = await prisma.payment.findMany({
        where: { enrollmentId: enrollment.id, mpStatus: "APPROVED" },
        select: {
          id: true,
          amount: true,
          gateway: true,
          mpPaymentId: true,
          asaasPaymentId: true,
        },
      })
      for (const p of payments) {
        try {
          if (p.gateway === "ASAAS" && p.asaasPaymentId) {
            if (!keys.asaasApiKey) throw new Error("conta Asaas da venda não disponível")
            await refundAsaasPayment(p.asaasPaymentId, undefined, keys.asaasApiKey)
          } else if (p.gateway === "MP" && p.mpPaymentId) {
            if (!keys.mpAccessToken) throw new Error("conta MP da venda não disponível")
            await refundMpPayment(keys.mpAccessToken, p.mpPaymentId)
          } else {
            continue
          }
          // Marca o Payment como REFUNDED no nosso banco. Os webhooks
          // PAYMENT_REFUNDED do gateway vão chegar depois e também atualizam,
          // mas marcar agora torna o estado visível imediatamente no painel.
          await prisma.payment.update({
            where: { id: p.id },
            data: { mpStatus: "REFUNDED" },
          })
          refundedCount += 1
          await logAudit({
            action: "enrollment.refund",
            resource: "Payment",
            resourceId: p.id,
            actorUserId: guard.ctx.userId,
            actorRole: guard.ctx.role,
            tenantId: enrollment.tenantId,
            payloadAfter: {
              enrollmentId: enrollment.id,
              studentId,
              amount: Number(p.amount),
              gateway: p.gateway,
              reason: refundReason ?? null,
            },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Falha no refund"
          refundErrors.push(`payment ${p.id}: ${msg}`)
          contextLogger().error(
            { err, event: "admin.enrollment.cancel.refund_failed", paymentId: p.id },
            "falha ao processar refund",
          )
        }
      }
    }

    const outcome = await cancelEnrollment({
      enrollmentId: enrollment.id,
      removeAccess,
      actor: {
        userId: guard.ctx.userId,
        role: guard.ctx.role,
      },
      reason,
    })

    if (!outcome.ok) {
      const status = outcome.code === "NOT_FOUND" ? 404 : 409
      const message =
        outcome.code === "NOT_FOUND"
          ? "Matrícula não encontrada"
          : outcome.code === "ALREADY_CANCELLED"
            ? "Matrícula já está cancelada"
            : "Curso já concluído — não é possível cancelar"
      return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({
      data: {
        ok: true,
        cancelledIds: outcome.cancelledIds,
        refundedCount,
        ...(outcome.gatewayError ? { gatewayError: outcome.gatewayError } : {}),
        ...(outcome.platformError ? { platformError: outcome.platformError } : {}),
        ...(refundErrors.length > 0 ? { refundErrors } : {}),
      },
    })
  },
)
