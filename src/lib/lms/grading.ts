import { lmsRequest } from "./client"

/**
 * CORRECAO DE DISSERTATIVAS dos cursos de autoria da unidade.
 *
 * A prova, as respostas e a nota moram no LMS; o PMB so empresta a tela. O
 * escopo vai no PATH (`/tenants/:tenantExternalId/...`) e e aplicado LA, na
 * query: tentativa de curso de outra unidade ou do catalogo da PMB responde
 * 404. `tenantExternalId` = `Tenant.id`, o mesmo de `PUT /tenants/:id`.
 *
 * Quem corrige e o PRODUTOR, inclusive a prova do aluno que comprou o curso na
 * vitrine de outra unidade — por isso o LMS devolve so o NOME do aluno.
 */

export interface LmsPendingEssay {
  id: string
  statement: string
  maxPoints: number
  text: string
}

export interface LmsPendingAttempt {
  id: string
  attemptedAt: string
  studentName: string
  course: { id: string; title: string }
  quiz: { id: string; title: string; minScore: number; placement: string | null }
  /** Pontos das objetivas, ja corrigidas no envio. */
  earnedPoints: number
  totalPoints: number
  essays: LmsPendingEssay[]
}

export async function listLmsPendingGrading(tenantExternalId: string): Promise<LmsPendingAttempt[]> {
  const res = await lmsRequest<{ data: { attempts: LmsPendingAttempt[] } }>(
    "GET",
    `/tenants/${encodeURIComponent(tenantExternalId)}/correcoes`,
  )
  return res.data.attempts
}

export async function gradeLmsAttempt(input: {
  tenantExternalId: string
  attemptId: string
  /** answerId -> pontos. Toda dissertativa pendente da tentativa precisa vir. */
  awards: Record<string, number>
  gradedBy: string
}): Promise<{ score: number; passed: boolean }> {
  const res = await lmsRequest<{ data: { score: number; passed: boolean } }>(
    "POST",
    `/tenants/${encodeURIComponent(input.tenantExternalId)}/correcoes/${encodeURIComponent(input.attemptId)}`,
    { body: { awards: input.awards, gradedBy: input.gradedBy } },
  )
  return res.data
}
