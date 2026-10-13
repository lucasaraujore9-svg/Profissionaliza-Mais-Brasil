import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCourseAuthoring } from "@/lib/course-authoring/module-gate"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"
import { isLmsAuthoringEnabled } from "@/lib/lms/authoring"
import { gradeLmsAttempt } from "@/lib/lms/grading"
import { LmsApiError } from "@/lib/lms/errors"

const bodySchema = z.object({
  /** answerId -> pontos concedidos. O LMS limita ao maximo de cada questao. */
  awards: z.record(z.string().max(64), z.number().int().min(0).max(1000)),
})

/**
 * Corrige as dissertativas de uma prova. A nota muda a aprovacao do aluno e o
 * progresso do curso (e, por ele, o certificado): fica em `audit_logs`.
 */
export const POST = withRequestContextParams<{ attemptId: string }>(
  {
    action: "painel.cursos_autorais.correcoes.grade",
    route: "/api/painel/cursos-autorais/correcoes/[attemptId]",
  },
  async (request, context) => {
    const guard = await requireCourseAuthoring("cursosAutorais.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { attemptId } = await context.params

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Notas inválidas." }, { status: 400 })
    }
    if (!isLmsAuthoringEnabled()) {
      return NextResponse.json(
        { error: "A plataforma de aulas não está disponível.", code: "AUTHORING_UNAVAILABLE" },
        { status: 503 },
      )
    }

    try {
      const result = await gradeLmsAttempt({
        tenantExternalId: ctx.tenantId,
        attemptId,
        awards: parsed.data.awards,
        gradedBy: ctx.userId,
      })
      await logAudit({
        action: "course_authoring.quiz_graded",
        resource: "QuizAttempt",
        resourceId: attemptId,
        actorUserId: ctx.userId,
        actorRole: ctx.memberRole,
        tenantId: ctx.tenantId,
        payloadAfter: { awards: parsed.data.awards, ...result },
      })
      return NextResponse.json({ data: result })
    } catch (err) {
      // 400 (nota faltando), 404 (prova de outra unidade) e 409 (ja corrigida)
      // sao respostas do LMS com mensagem pronta para a pessoa.
      if (err instanceof LmsApiError && err.statusCode && err.statusCode < 500) {
        return NextResponse.json(
          { error: err.apiError ?? "Não foi possível salvar a correção." },
          { status: err.statusCode },
        )
      }
      contextLogger().error(
        { event: "course_authoring.grading_failed", tenantId: ctx.tenantId, attemptId, err },
        "falha ao corrigir prova no LMS",
      )
      return NextResponse.json(
        { error: "Não foi possível salvar a correção agora. Tente novamente.", code: "LMS_UNAVAILABLE" },
        { status: 502 },
      )
    }
  },
)
