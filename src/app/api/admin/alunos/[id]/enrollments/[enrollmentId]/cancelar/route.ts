import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { cancelSubscription, deletePayment } from "@/lib/asaas/client"
import { cancelPreapproval } from "@/lib/mercadopago/client"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"

const bodySchema = z.object({
  removeFromEA: z.boolean().optional().default(false),
})

interface Ctx {
  params: Promise<{ id: string; enrollmentId: string }>
}

export async function POST(request: Request, ctx: Ctx) {
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
  const { removeFromEA } = parsed.data

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
      console.error("[cancelar] falha no Asaas:", err)
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
        console.error("[cancelar] falha no MP:", err)
      }
    }
  }

  // Remove course access from the platform if requested and enrollment was active
  if (removeFromEA && wasActive && enrollment.courseId) {
    try {
      await unlinkCourseFromStudent(studentId, enrollment.courseId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao remover acesso na plataforma"
      console.error("[cancelar] falha ao desvincular curso na plataforma:", err)
      // Merge into gatewayError if not already set
      gatewayError = gatewayError ? `${gatewayError}; plataforma: ${msg}` : `Plataforma: ${msg}`
    }
  }

  // Update enrollment status to CANCELLED
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { status: "CANCELLED" },
  })

  return NextResponse.json({
    data: {
      ok: true,
      ...(gatewayError ? { gatewayError } : {}),
    },
  })
}
