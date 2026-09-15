import { NextResponse } from "next/server"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { releaseSubscriptionSlot } from "@/lib/subscriptions/release"
import { findLiveSubscriptionId } from "@/lib/subscriptions/live"
import { SLOT_NOT_RELEASABLE_MESSAGE } from "@/lib/subscriptions/slots"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * "Tirar da lista": libera uma das vagas da assinatura.
 *
 * Não é cancelar o curso — onde a plataforma de aulas guarda o progresso, o
 * card do catálogo passa a oferecer "Retomar"; onde não guarda, só sai curso
 * ainda não começado (`findReleasable`). Mesmo bucket de rate limit do
 * "Começar": as duas ações falam com a fornecedora e juntas formam a troca.
 */
export const POST = withRequestContextParams<{ courseId: string }>(
  {
    action: "aluno.assinatura.remover",
    route: "/api/aluno/assinatura/curso/[courseId]/remover",
  },
  async (_request: Request, { params }) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const rl = await rateLimitByKey(
      `aluno:${session.studentId}`,
      RATE_LIMITS.alunoLiberarCurso,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    const { courseId } = await params

    const subscriptionId = await findLiveSubscriptionId(session.studentId)
    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Você não tem uma assinatura ativa", code: "SUBSCRIPTION_INACTIVE" },
        { status: 403 },
      )
    }

    const result = await releaseSubscriptionSlot(subscriptionId, courseId)
    if (!result.ok) {
      if (result.reason === "BUSY") {
        return NextResponse.json(
          { error: "Alteração em andamento, tente novamente", code: result.reason },
          { status: 409 },
        )
      }
      if (result.reason === "PROVIDER_FAILED") {
        return NextResponse.json(
          {
            error: "A plataforma de aulas não respondeu. Tente novamente em instantes.",
            code: result.reason,
          },
          { status: 502 },
        )
      }
      return NextResponse.json(
        { error: SLOT_NOT_RELEASABLE_MESSAGE, code: result.reason },
        { status: 422 },
      )
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
