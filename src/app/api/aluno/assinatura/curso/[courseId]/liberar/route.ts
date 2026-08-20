import { NextResponse } from "next/server"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { prisma } from "@/lib/prisma"
import { releaseSubscriptionCourse } from "@/lib/subscriptions/release"
import { subscriptionGrantsAccess } from "@/lib/subscriptions/access"

export const dynamic = "force-dynamic"
// Provisiona na fornecedora (EA ou LMS), com timeout próprio.
export const maxDuration = 60

/**
 * "Começar" um curso do plano assinado.
 *
 * O provisionamento é SOB DEMANDA: um plano de catálogo inteiro cobre 100+
 * cursos, e matricular todos na contratação encheria o painel do aluno e
 * exigiria 100+ chamadas ao LMS (que matricula um curso por vez). Aqui a
 * matrícula nasce quando ele abre o curso.
 *
 * O resultado é um `Enrollment` comum — é isso que faz SSO, progresso e
 * certificado funcionarem sem código novo.
 */
export const POST = withRequestContextParams<{ courseId: string }>(
  {
    action: "aluno.assinatura.liberar",
    route: "/api/aluno/assinatura/curso/[courseId]/liberar",
  },
  async (_request: Request, { params }) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Limite por ALUNO, não por IP: o custo é da conta dele, e alunos atrás do
    // mesmo IP (escola, lan house) não podem se estrangular.
    const rl = await rateLimitByKey(
      `aluno:${session.studentId}`,
      RATE_LIMITS.alunoLiberarCurso,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    const { courseId } = await params

    // Assinatura viva do aluno. `subscriptionGrantsAccess` decide pelo PRAZO do
    // ciclo pago, não só pelo status — uma assinatura ACTIVE cujo ciclo caiu há
    // semanas (webhook perdido) não pode continuar liberando curso novo.
    const subs = await prisma.studentSubscription.findMany({
      where: {
        studentId: session.studentId,
        status: { in: ["ACTIVE", "PAST_DUE"] },
      },
      select: { id: true, status: true, currentPeriodEnd: true },
      orderBy: { createdAt: "desc" },
    })
    const live = subs.find((s) => subscriptionGrantsAccess(s))

    if (!live) {
      return NextResponse.json(
        { error: "Você não tem uma assinatura ativa", code: "SUBSCRIPTION_INACTIVE" },
        { status: 403 },
      )
    }

    const result = await releaseSubscriptionCourse(live.id, courseId)

    if (!result.ok) {
      if (result.reason === "COURSE_NOT_IN_PLAN") {
        return NextResponse.json(
          { error: "Este curso não faz parte do seu plano", code: result.reason },
          { status: 403 },
        )
      }
      if (result.reason === "BUSY") {
        // Outra chamada está provisionando o MESMO curso agora (duplo clique).
        // 409 e não 500: o cliente deve reconsultar, não tratar como erro.
        return NextResponse.json(
          { error: "Liberação em andamento, tente novamente", code: result.reason },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: "Curso indisponível", code: result.reason },
        { status: 404 },
      )
    }

    return NextResponse.json({
      data: { enrollmentId: result.enrollmentId, created: result.created },
    })
  },
)
