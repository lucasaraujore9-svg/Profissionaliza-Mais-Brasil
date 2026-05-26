import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import {
  cancelSubscription,
  deletePayment,
  refundPayment as refundAsaasPayment,
} from "@/lib/asaas/client"
import {
  cancelPreapproval,
  refundPayment as refundMpPayment,
} from "@/lib/mercadopago/client"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

const bodySchema = z.object({
  removeFromEA: z.boolean().optional().default(false),
  // Estorno opcional ao aluno (CDC art. 49: cliente pode desistir em até 7
  // dias da compra online). UI deve perguntar "Reembolsar pagamento?" ao
  // cancelar enrollment paga. Default false pra não estornar acidentalmente.
  refund: z.boolean().optional().default(false),
  refundReason: z.string().trim().max(500).optional(),
})

export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  { action: "admin.alunos.enrollments.cancel", route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar" },
  async (request: Request, ctx) => {
  const guard = await requirePmbSales()
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
  const { removeFromEA, refund, refundReason } = parsed.data

  const whereEnrollment =
    guard.session.role === "SUPER_ADMIN"
      ? { id: enrollmentId, studentId, tenantId: null as null }
      : { id: enrollmentId, studentId, tenantId: null as null, soldByUserId: guard.session.userId }

  const enrollment = await prisma.enrollment.findFirst({
    where: whereEnrollment,
    select: {
      id: true,
      status: true,
      gateway: true,
      asaasPaymentId: true,
      asaasSubscriptionId: true,
      mpSubscriptionId: true,
      courseId: true,
    },
  })

  if (!enrollment) {
    return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
  }

  if (enrollment.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Matrícula já está cancelada" },
      { status: 409 },
    )
  }

  const wasActive = enrollment.status === "ACTIVE"
  let gatewayError: string | undefined

  // Try to cancel in payment gateway — soft failure (log and continue)
  if (enrollment.gateway === "ASAAS") {
    try {
      if (enrollment.asaasSubscriptionId) {
        await cancelSubscription(enrollment.asaasSubscriptionId)
      } else if (enrollment.asaasPaymentId && enrollment.status === "PENDING") {
        await deletePayment(enrollment.asaasPaymentId)
      }
    } catch (err) {
      gatewayError = err instanceof Error ? err.message : "Falha ao cancelar no Asaas"
      contextLogger().error(
        { err, event: "admin.enrollment.cancel.asaas_failed", enrollmentId: enrollment.id },
        "falha ao cancelar no Asaas",
      )
    }
  } else if (enrollment.gateway === "MP") {
    if (enrollment.mpSubscriptionId) {
      try {
        const mpToken = await pmbMpAccessToken()
        if (!mpToken) {
          gatewayError = "Token Mercado Pago não configurado"
        } else {
          await cancelPreapproval(mpToken, enrollment.mpSubscriptionId)
        }
      } catch (err) {
        gatewayError = err instanceof Error ? err.message : "Falha ao cancelar no Mercado Pago"
        contextLogger().error(
          { err, event: "admin.enrollment.cancel.mp_failed", enrollmentId: enrollment.id },
          "falha ao cancelar no MP",
        )
      }
    }
  }

  // Remove course access from the platform if requested and enrollment was active
  if (removeFromEA && wasActive && enrollment.courseId) {
    try {
      await unlinkCourseFromStudent(studentId, enrollment.courseId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao remover acesso na plataforma"
      contextLogger().error(
        { err, event: "admin.enrollment.cancel.unlink_failed", enrollmentId: enrollment.id, studentId, courseId: enrollment.courseId },
        "falha ao desvincular curso na plataforma",
      )
      // Merge into gatewayError if not already set
      gatewayError = gatewayError ? `${gatewayError}; plataforma: ${msg}` : `Plataforma: ${msg}`
    }
  }

  // Estorno (refund) ao aluno quando solicitado. Aplica em todos os Payments
  // APPROVED ainda não estornados desta enrollment. Para CDC art. 49 e
  // suporte ao cliente. Erros aqui são registrados mas não bloqueiam o
  // cancelamento (UI mostra refundError).
  const refundErrors: string[] = []
  let refundedCount = 0
  if (refund) {
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
          await refundAsaasPayment(p.asaasPaymentId)
        } else if (p.gateway === "MP" && p.mpPaymentId) {
          const mpToken = await pmbMpAccessToken()
          if (!mpToken) throw new Error("Token MP PMB não configurado")
          await refundMpPayment(mpToken, p.mpPaymentId)
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

  // Update enrollment status to CANCELLED
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { status: "CANCELLED" },
  })

  // Audit log estruturado (sem tabela dedicada — ver REVIEW.md)
  await logAudit({
    action: "enrollment.cancel",
    resource: "Enrollment",
    resourceId: enrollment.id,
    actorUserId: guard.session.userId,
    actorRole: guard.session.role,
    payloadBefore: { status: enrollment.status, gateway: enrollment.gateway },
    payloadAfter: {
      status: "CANCELLED",
      removeFromEA,
      refunded: refundedCount,
      hadGatewayError: Boolean(gatewayError),
      studentId,
    },
  })

  return NextResponse.json({
    data: {
      ok: true,
      refundedCount,
      ...(gatewayError ? { gatewayError } : {}),
      ...(refundErrors.length > 0 ? { refundErrors } : {}),
    },
  })
  },
)
