import { NextResponse } from "next/server"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { syncStudentProgress } from "@/lib/students/progress"
import { syncLmsStudentProgress } from "@/lib/lms/student-progress"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"
// Duas chamadas externas em sequência (EA + LMS), ambas com timeout próprio.
export const maxDuration = 60

/**
 * "Atualizar progresso" do próprio aluno.
 *
 * Existe porque o progresso é uma CÓPIA: a plataforma de aulas legada não tem
 * webhook e o LMS entrega por delta horário. Sem este botão, o aluno que acaba
 * de terminar a última aula precisa esperar o cron das 07:00 para a área do
 * aluno concordar com o que ele acabou de fazer — e, com o certificado gateado
 * pelo progresso, esperar para poder emitir.
 *
 * Fura os dois atalhos de 5 min (`force`) de propósito: um botão que respeita
 * cache é um botão que não faz nada. O contrapeso é o rate limit por ALUNO.
 *
 * Consulta as DUAS fornecedoras e é tolerante a falha de cada uma: se a EA cair,
 * o aluno de curso LMS ainda atualiza (e vice-versa). Só devolve erro quando
 * nenhuma das duas respondeu.
 */
export const POST = withRequestContext(
  {
    action: "aluno.progresso.sincronizar",
    route: "/api/aluno/progresso/sincronizar",
  },
  async () => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const limit = await rateLimitByKey(
      session.studentId,
      RATE_LIMITS.alunoSyncProgresso,
    )
    if (!limit.ok) return rateLimitResponse(limit)

    const log = contextLogger()
    let updated = 0
    let certificatesIssued = 0
    let anySucceeded = false

    // Plataforma de aulas legada (EA).
    try {
      const ea = await syncStudentProgress(session.studentId, { force: true })
      updated += ea.updated
      certificatesIssued += ea.certificatesIssued
      anySucceeded = true
    } catch (err) {
      log.warn(
        { err, event: "aluno.progresso.ea_failed", studentId: session.studentId },
        "atualização de progresso na EA falhou",
      )
    }

    // Fornecedora LMS. Já degrada internamente (devolve zerado em falha), então
    // uma exceção aqui é bug nosso, não indisponibilidade dela.
    try {
      const lms = await syncLmsStudentProgress(session.studentId)
      updated += lms.updated
      certificatesIssued += lms.certificatesIssued
      anySucceeded = true
    } catch (err) {
      log.warn(
        { err, event: "aluno.progresso.lms_failed", studentId: session.studentId },
        "atualização de progresso no LMS falhou",
      )
    }

    if (!anySucceeded) {
      return NextResponse.json(
        {
          error:
            "Não foi possível falar com a plataforma de aulas agora. Tente novamente em alguns minutos.",
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ updated, certificatesIssued }, { status: 200 })
  },
)
