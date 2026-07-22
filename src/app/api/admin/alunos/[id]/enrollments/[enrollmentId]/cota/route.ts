import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { logAudit } from "@/lib/audit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const schema = z.object({
  /** true = libera a cota (destrava); false = devolve a matrícula à regra. */
  exempt: z.boolean(),
  reason: z.string().trim().max(500).optional(),
})

/**
 * PATCH /api/admin/alunos/[id]/enrollments/[enrollmentId]/cota
 *
 * Liberação MANUAL da cota de aulas de uma matrícula — a válvula de escape para
 * o caso que a regra não previu (acordo comercial, erro de cobrança, cortesia).
 *
 * Só SUPER_ADMIN: destravar é abrir mão de uma garantia de recebimento, então
 * não é decisão de quem apenas atende. Sempre auditado — quem liberou, quando e
 * por quê ficam registrados.
 *
 * Reavalia a cota logo em seguida, para o efeito (destravar de verdade na
 * plataforma de aulas) valer na hora, e não só na próxima varredura.
 */
export const PATCH = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "admin.alunos.enrollments.cota",
    route: "/api/admin/alunos/[id]/enrollments/[enrollmentId]/cota",
  },
  async (request: Request, ctx) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Só o SUPER_ADMIN pode liberar a cota de aulas." },
        { status: 403 },
      )
    }

    const { id: studentId, enrollmentId } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
    }
    const { exempt, reason } = parsed.data

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId },
      select: { id: true, tenantId: true, paceExemptAt: true },
    })
    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        paceExemptAt: exempt ? new Date() : null,
        paceExemptByUserId: exempt ? session.userId : null,
      },
    })

    // Aplica agora: liberar grava o flag, mas quem devolve o acesso na
    // plataforma é o motor. Sem esta chamada o aluno só destravaria na
    // varredura do dia seguinte.
    const evaluation = await evaluatePaceGate(enrollment.id)

    await logAudit({
      action: exempt ? "enrollment.pace_exempt" : "enrollment.pace_exempt_revoked",
      resource: "Enrollment",
      resourceId: enrollment.id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      tenantId: enrollment.tenantId,
      payloadBefore: { paceExemptAt: enrollment.paceExemptAt?.toISOString() ?? null },
      payloadAfter: {
        exempt,
        studentId,
        reason: reason ?? null,
        blockedAfter: evaluation?.blocked ?? null,
      },
    })

    return NextResponse.json({
      data: { ok: true, exempt, blocked: evaluation?.blocked ?? false },
    })
  },
)
