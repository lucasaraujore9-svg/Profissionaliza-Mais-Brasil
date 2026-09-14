import { NextResponse } from "next/server"
import { z } from "zod"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { syncLmsStudentProgress } from "@/lib/lms/student-progress"
import { releaseSubscriptionCourse } from "@/lib/subscriptions/release"
import { loadSubscriptionSlots } from "@/lib/subscriptions/catalog"
import { findLiveSubscriptionId } from "@/lib/subscriptions/live"

export const dynamic = "force-dynamic"
// Provisiona na fornecedora (EA ou LMS), com timeout próprio. Numa troca são
// duas idas (revogar um curso e matricular o outro).
export const maxDuration = 60

/**
 * Corpo OPCIONAL: sem ele é o "Começar"/"Retomar" de sempre. Com
 * `substituirCursoId`, é a troca — só usada quando a lista de cursos da
 * assinatura está cheia.
 */
const bodySchema = z
  .object({ substituirCursoId: z.string().min(1).max(64).optional() })
  .strict()

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
  async (request: Request, { params }) => {
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

    const raw = await request.text()
    let json: unknown = {}
    if (raw.trim()) {
      try {
        json = JSON.parse(raw)
      } catch {
        return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
      }
    }
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
    }

    const { courseId } = await params

    const subscriptionId = await findLiveSubscriptionId(session.studentId)
    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Você não tem uma assinatura ativa", code: "SUBSCRIPTION_INACTIVE" },
        { status: 403 },
      )
    }

    const opts = { replaceCourseId: parsed.data.substituirCursoId }
    let result = await releaseSubscriptionCourse(subscriptionId, courseId, opts)

    // Lista cheia: antes de mandar o aluno escolher o que tirar, puxa o
    // progresso da plataforma de aulas. Um curso que ele acabou de concluir
    // ainda pode estar "em andamento" aqui (o delta roda de hora em hora) — e
    // concluído não ocupa vaga. Só neste caminho, para o clique comum não pagar
    // a latência.
    if (!result.ok && result.reason === "SLOTS_FULL") {
      try {
        const synced = await syncLmsStudentProgress(session.studentId)
        if (synced.updated > 0) {
          result = await releaseSubscriptionCourse(subscriptionId, courseId, opts)
        }
      } catch (err) {
        contextLogger().warn(
          { err, event: "aluno.assinatura.slots_sync_failed", studentId: session.studentId },
          "sync de progresso antes da troca falhou — segue com a contagem local",
        )
      }
    }

    if (!result.ok) {
      switch (result.reason) {
        case "COURSE_NOT_IN_PLAN":
          return NextResponse.json(
            { error: "Este curso não faz parte do seu plano", code: result.reason },
            { status: 403 },
          )
        case "BUSY":
          // Outra alteração da lista está em andamento agora (duplo clique).
          // 409 e não 500: o cliente deve reconsultar, não tratar como erro.
          return NextResponse.json(
            { error: "Liberação em andamento, tente novamente", code: result.reason },
            { status: 409 },
          )
        case "SLOTS_FULL":
          return NextResponse.json(
            {
              error: "Sua lista de cursos está cheia. Escolha um curso para tirar da lista.",
              code: result.reason,
              slots: await loadSubscriptionSlots(subscriptionId),
            },
            { status: 409 },
          )
        case "PROVIDER_FAILED":
          return NextResponse.json(
            {
              error: "A plataforma de aulas não respondeu. Tente novamente em instantes.",
              code: result.reason,
            },
            { status: 502 },
          )
        case "SLOT_NOT_RELEASABLE":
          return NextResponse.json(
            { error: "Esse curso não pode sair da sua lista", code: result.reason },
            { status: 422 },
          )
        default:
          return NextResponse.json(
            { error: "Curso indisponível", code: result.reason },
            { status: 404 },
          )
      }
    }

    return NextResponse.json({
      data: { enrollmentId: result.enrollmentId, created: result.created },
    })
  },
)
