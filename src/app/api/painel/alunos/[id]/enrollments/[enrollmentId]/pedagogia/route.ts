import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePainel, type PainelContext } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { setLmsEnrollmentPolicy } from "@/lib/lms"
import { contextLogger } from "@/lib/logger"
import { orderOverrideInputSchema } from "@/lib/pedagogia/schema"
import { lmsEnrollmentPolicyBody, parseOrderOverride, type OrderOverride } from "@/lib/pedagogia/order-override"

/**
 * PUT/DELETE /api/painel/alunos/[id]/enrollments/[enrollmentId]/pedagogia
 *
 * A unidade troca a ORDEM de liberacao das aulas (livre / sequencial /
 * gotejamento) de UM aluno num curso ja vendido. DELETE volta a seguir a regra
 * do curso/unidade.
 *
 * A plataforma de aulas e avisada ANTES de gravar: se ela nao aceitar, nada muda
 * aqui — a tela nunca diz "sequencial" para um aluno que segue livre la.
 * Gotejamento conta a partir da MATRICULA, entao ligar num aluno antigo libera
 * na hora tudo o que ja "venceu".
 */

type Params = { id: string; enrollmentId: string }

async function apply(ctx: PainelContext, params: Promise<Params>, order: OrderOverride | null) {
  const { id: studentId, enrollmentId } = await params

  // Aluno da unidade E da carteira de quem pede — mesmo recorte das outras
  // rotas de /api/painel/alunos.
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId, ...ctx.scope.alunos },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })

  const e = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, studentId, tenantId: ctx.tenantId },
    select: { id: true, courseId: true, status: true, lmsEnrollmentId: true, pedagogyOrder: true },
  })
  if (!e) return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
  if (!e.lmsEnrollmentId || e.status === "CANCELLED") {
    return NextResponse.json(
      { error: "A ordem das aulas não pode ser alterada nesta matrícula." },
      { status: 409 },
    )
  }

  const [tenant, tc] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { pedagogyPolicy: true } }),
    prisma.tenantCourse.findUnique({
      where: { tenantId_courseId: { tenantId: ctx.tenantId, courseId: e.courseId } },
      select: { pedagogyPolicy: true },
    }),
  ])

  try {
    await setLmsEnrollmentPolicy(
      e.lmsEnrollmentId,
      lmsEnrollmentPolicyBody(tenant?.pedagogyPolicy, tc?.pedagogyPolicy, order),
    )
  } catch (err) {
    contextLogger().error(
      { err, event: "pedagogia.enrollment_override_failed", enrollmentId: e.id },
      "plataforma de aulas recusou a ordem da matricula",
    )
    return NextResponse.json(
      { error: "A plataforma de aulas não respondeu. Nada foi alterado — tente de novo em instantes." },
      { status: 502 },
    )
  }

  try {
    await prisma.enrollment.update({
      where: { id: e.id },
      data: { pedagogyOrder: order ? { ...order } : Prisma.DbNull },
    })
  } catch (err) {
    // O LMS ja aceitou e o banco nao gravou: devolve ao LMS a regra que o banco
    // ainda diz, senao a matricula ficaria la com um bloco que nenhuma
    // propagacao futura sabe que existe.
    await setLmsEnrollmentPolicy(
      e.lmsEnrollmentId,
      lmsEnrollmentPolicyBody(tenant?.pedagogyPolicy, tc?.pedagogyPolicy, e.pedagogyOrder),
    ).catch((revertErr) =>
      contextLogger().error(
        { err: revertErr, event: "pedagogia.enrollment_override_revert_failed", enrollmentId: e.id },
        "LMS ficou com a ordem nova e o banco sem ela",
      ),
    )
    throw err
  }

  await logAudit({
    action: order ? "enrollment.pedagogia.update" : "enrollment.pedagogia.clear",
    resource: "Enrollment",
    resourceId: e.id,
    actorUserId: ctx.userId,
    actorRole: ctx.memberRole,
    tenantId: ctx.tenantId,
    payloadBefore: parseOrderOverride(e.pedagogyOrder),
    payloadAfter: order,
  })

  return NextResponse.json({ ok: true, ordem: order })
}

export const PUT = withRequestContextParams<Params>(
  {
    action: "painel.alunos.enrollments.pedagogia.update",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/pedagogia",
  },
  async (request: Request, { params }) => {
    const guard = await requirePainel("pedagogia.manage")
    if (!guard.ok) return guard.response
    const parsed = orderOverrideInputSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 400 })
    }
    return apply(guard.ctx, params, parsed.data)
  },
)

export const DELETE = withRequestContextParams<Params>(
  {
    action: "painel.alunos.enrollments.pedagogia.clear",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/pedagogia",
  },
  async (_request: Request, { params }) => {
    const guard = await requirePainel("pedagogia.manage")
    if (!guard.ok) return guard.response
    return apply(guard.ctx, params, null)
  },
)
