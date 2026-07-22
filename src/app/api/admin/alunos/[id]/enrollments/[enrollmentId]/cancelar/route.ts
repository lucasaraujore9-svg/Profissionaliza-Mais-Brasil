import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbTeam, type AuthedSession } from "@/lib/auth/guards"
import { canAccessTenantScope } from "@/lib/auth/scope"
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
 * Autorização por papel para cancelar a matrícula de QUALQUER aluno (vitrine
 * PMB ou de revenda):
 *   SUPER_ADMIN                                   -> qualquer matrícula
 *   PMB_SALES                                     -> só vendas da vitrine PMB
 *                                                    que ele mesmo originou
 *   PMB_RESELLER_MGR / PMB_REVENDA_SALES /
 *   PMB_SALES_MGR                                 -> só unidades no seu escopo
 *                                                    (canAccessTenantScope)
 *   demais (PMB_FINANCEIRO, PMB_DESIGNER)         -> nunca
 */
async function canCancel(
  session: AuthedSession,
  enrollment: { tenantId: string | null; soldByUserId: string | null },
): Promise<boolean> {
  if (session.role === "SUPER_ADMIN") return true

  if (enrollment.tenantId === null) {
    return (
      session.role === "PMB_SALES" && enrollment.soldByUserId === session.userId
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: enrollment.tenantId },
    select: { accountManagerId: true, salesUserId: true },
  })
  return canAccessTenantScope(session, tenant)
}

export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "admin.alunos.enrollments.cancel",
    route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar",
  },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
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

    if (!(await canCancel(guard.session, enrollment))) {
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
            actorUserId: guard.session.userId,
            actorRole: guard.session.role,
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
        userId: guard.session.userId,
        role: guard.session.role,
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
