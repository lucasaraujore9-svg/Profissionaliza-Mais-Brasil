import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
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
 * Duas camadas de permissão: `alunos.manage` (+ escopo do papel) para desfazer
 * uma venda ainda NÃO PAGA; matrícula já paga exige também `financeiro.view` —
 * desligar quem pagou mexe em dinheiro e é decisão de quem enxerga o caixa
 * (dono, gerente). Vendedor e secretaria ficam de fora dessa segunda camada.
 */
export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "painel.alunos.enrollments.cancel",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/cancelar",
  },
  async (request: Request, ctx) => {
    const guard = await requirePainel("alunos.manage")
    if (!guard.ok) return guard.response
    const { ctx: session } = guard

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
      where: { id: studentId, tenantId: session.tenantId, ...session.scope.alunos },
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

    if (enrollment.status !== "PENDING" && !session.can("financeiro.view")) {
      return NextResponse.json(
        {
          error:
            "Só quem administra o financeiro da unidade pode cancelar uma matrícula já paga. Peça ao titular ou ao gerente.",
        },
        { status: 403 },
      )
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
