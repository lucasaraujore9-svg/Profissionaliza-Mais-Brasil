import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import {
  cancelEnrollment,
  isCancellableEnrollmentStatus,
} from "@/lib/enrollment/cancel"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  /** Também desvincula o curso na plataforma de aulas. */
  removeAccess: z.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional(),
})

/**
 * POST /api/painel/alunos/[id]/enrollments/[enrollmentId]/cancelar
 *
 * A unidade cancela a matrícula de um aluno DELA. Sem estorno: o dinheiro está
 * na conta MP/Asaas da própria unidade e a devolução é decisão dela, feita no
 * painel do gateway.
 *
 * Owner x consultor: o consultor (TenantMember, `User.tenantId = null`) desfaz
 * apenas venda ainda NÃO PAGA (PENDING) — desligar um aluno que já pagou é
 * decisão do dono da unidade. Mesma técnica de checagem de owner direto usada
 * em `requireResellerOwner` (src/lib/auth/guards.ts).
 */
export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "painel.alunos.enrollments.cancel",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/cancelar",
  },
  async (request: Request, ctx) => {
    const session = await requireResellerSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

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
    const { removeAccess, reason } = parsed.data

    // O aluno TEM que ser da unidade logada — junto com o `expectedTenantId`
    // passado ao motor, fecha o isolamento pelos dois lados (aluno e matrícula).
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId: session.tenantId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId, tenantId: session.tenantId },
      select: { id: true, status: true },
    })
    if (!enrollment) {
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

    if (enrollment.status !== "PENDING") {
      const owner = await prisma.user.findFirst({
        where: { id: session.userId, tenantId: session.tenantId },
        select: { id: true },
      })
      if (!owner) {
        return NextResponse.json(
          {
            error:
              "Só o titular da unidade pode cancelar uma matrícula já paga. Peça a ele.",
          },
          { status: 403 },
        )
      }
    }

    const outcome = await cancelEnrollment({
      enrollmentId: enrollment.id,
      expectedTenantId: session.tenantId,
      removeAccess,
      actor: { userId: session.userId, role: "RESELLER" },
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
        ...(outcome.gatewayError ? { gatewayError: outcome.gatewayError } : {}),
        ...(outcome.platformError ? { platformError: outcome.platformError } : {}),
      },
    })
  },
)
