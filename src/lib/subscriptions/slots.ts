import type { CourseProvider, EnrollmentStatus, Prisma } from "@prisma/client"

/**
 * VAGAS da assinatura: quantos cursos o assinante pode ter EM ANDAMENTO ao
 * mesmo tempo.
 *
 * O plano pode cobrir o catalogo inteiro, mas o aluno estuda no maximo
 * `SUBSCRIPTION_MAX_ACTIVE_COURSES` por vez. Para abrir mais um, tira outro da
 * lista. Na plataforma propria TIRAR NAO E PERDER: a matricula e revogada, o
 * progresso fica guardado por aluno, e "Retomar" devolve o curso de onde parou.
 * Na legada tirar apagaria o progresso, entao la o curso so sai da lista antes
 * de o aluno comecar (`canReleaseSubscriptionSlot`).
 *
 * Modulo PURO — a tela do aluno (client) importa a constante daqui, e a regra
 * de "ocupa vaga" tem o predicado e o `where` lado a lado para o teste de
 * paridade conseguir segurar os dois.
 */

export const SUBSCRIPTION_MAX_ACTIVE_COURSES = 10

/**
 * A regra em uma frase, para as telas de VENDA. Mora aqui, ao lado do numero,
 * porque vender "estude quantos cursos quiser" sem dizer que sao ate 10 por vez
 * e prometer algo que a tela do assinante depois recusa.
 */
export const SUBSCRIPTION_SLOTS_RULE_TEXT = `Até ${SUBSCRIPTION_MAX_ACTIVE_COURSES} cursos em andamento ao mesmo tempo. Concluiu um ou tirou da lista, abre outro. Alguns cursos só saem da lista antes de você começar.`

/**
 * Status que ocupam vaga. PENDING e SUSPENDED entram de proposito: sao estados
 * que VOLTAM a ACTIVE sozinhos (pagamento confirmado, inadimplencia quitada), e
 * deixa-los de fora abriria a porta para o 11o curso voltar por tras.
 */
export const SLOT_OCCUPYING_STATUSES: EnrollmentStatus[] = [
  "ACTIVE",
  "PENDING",
  "SUSPENDED",
]

/** O minimo que a decisao precisa saber da matricula. */
export interface SlotEnrollmentInput {
  status: EnrollmentStatus
  progressStatus: string | null
}

/**
 * Esta matricula da assinatura ocupa uma vaga?
 *
 * Curso CONCLUIDO nao ocupa (decisao do dono): quem terminou libera a vaga e
 * continua com o curso aberto para revisar e emitir certificado. "Concluido" e
 * o que a plataforma de aulas reporta (`progressStatus = CONCLUIDO`) OU a
 * matricula ja promovida a COMPLETED — nao o percentual minimo do certificado,
 * que e configuracao de emissao e mudaria o numero de vagas de todo assinante
 * no dia em que alguem o editasse.
 */
export function occupiesSubscriptionSlot(e: SlotEnrollmentInput): boolean {
  if (!SLOT_OCCUPYING_STATUSES.includes(e.status)) return false
  return e.progressStatus !== "CONCLUIDO"
}

/**
 * `where` gemeo de `occupiesSubscriptionSlot`, para contar no banco.
 *
 * O `OR` com `null` nao e enfeite: `progressStatus: { not: "CONCLUIDO" }` vira
 * `progress_status <> 'CONCLUIDO'`, que e NULL (e portanto falso) para a
 * matricula que nunca sincronizou progresso. Sem ele, todo curso recem-aberto
 * ficaria FORA da contagem e o limite nunca seria atingido.
 */
export function slotOccupyingWhere(
  subscriptionId: string,
): Prisma.EnrollmentWhereInput {
  return {
    studentSubscriptionId: subscriptionId,
    status: { in: SLOT_OCCUPYING_STATUSES },
    OR: [{ progressStatus: null }, { progressStatus: { not: "CONCLUIDO" } }],
  }
}

/** O que a decisao "pode sair da lista?" precisa saber da matricula. */
export interface ReleasableEnrollmentInput extends SlotEnrollmentInput {
  provider: CourseProvider
  progressPercent: number | null
}

/**
 * Tirar este curso da lista preserva o progresso?
 *
 * Na plataforma PROPRIA sim: a revogacao guarda o progresso por aluno e
 * "Retomar" volta de onde parou. Na LEGADA nao: desvincular APAGA o progresso
 * (`docs/api/plataforma-parceira-api-completa.md`, secao 4.5), e revincular
 * recomeca do zero.
 */
export function slotReleaseKeepsProgress(provider: CourseProvider): boolean {
  return provider === "LMS"
}

/**
 * Situacao que a plataforma legada reporta para curso vinculado e NUNCA aberto.
 * Em producao (15/09/2026) toda matricula AGUARDANDO estava em 0%.
 */
export const NOT_STARTED_PROGRESS_STATUS = "AGUARDANDO"

/**
 * O aluno JA COMECOU este curso, pela copia local do progresso?
 *
 * O percentual sozinho nao basta: a legada arredonda para baixo, e em producao
 * havia 105 matriculas EM_ANDAMENTO com 0% — gente que abriu a primeira aula e
 * nao a terminou. Por isso "nao comecou" e 0% E situacao AGUARDANDO.
 * `progressStatus` null (matricula recem-aberta, ainda sem sincronizar) nao
 * prova nada — conta como nao comecado aqui, e a conferencia ao vivo de
 * `release.ts` decide antes de desvincular.
 *
 * `lastLessonAt` fica de fora de proposito: a legada preenche a "data da ultima
 * aula" ate em curso AGUARDANDO, entao ela nao distingue quem assistiu.
 */
export function hasStartedCourse(e: {
  progressPercent: number | null
  progressStatus: string | null
}): boolean {
  if ((e.progressPercent ?? 0) > 0) return true
  return e.progressStatus !== null && e.progressStatus !== NOT_STARTED_PROGRESS_STATUS
}

/**
 * O aluno pode tirar este curso da lista?
 *
 * - Plataforma PROPRIA: sempre que o curso ocupa vaga — o progresso fica salvo.
 * - Plataforma LEGADA: so enquanto o aluno NAO COMECOU (decisao do dono,
 *   15/09/2026). La desvincular apaga o progresso; antes de comecar nao ha o
 *   que perder, e o aluno que abriu o curso por engano nao fica com a vaga
 *   presa. Depois de comecar, a vaga so libera quando ele concluir.
 *
 * Este predicado le a COPIA LOCAL do progresso, que na legada pode estar
 * atrasada (nao ha webhook). Serve para a TELA; antes de desvincular de fato,
 * `release.ts` confere o progresso ao vivo na plataforma.
 */
export function canReleaseSubscriptionSlot(e: ReleasableEnrollmentInput): boolean {
  if (!occupiesSubscriptionSlot(e)) return false
  if (slotReleaseKeepsProgress(e.provider)) return true
  return !hasStartedCourse(e)
}

/**
 * Recusa de "tirar da lista". Um texto so para as duas rotas (tirar e trocar):
 * o caso comum e o curso ja comecado que nao guarda progresso, e o aluno precisa
 * saber o que fazer, nao so que nao pode.
 */
export const SLOT_NOT_RELEASABLE_MESSAGE =
  "Esse curso não pode sair da sua lista. Se você já começou, a vaga libera quando concluir."

export interface SubscriptionSlotCourse {
  courseId: string
  nome: string
  progressPercent: number
  /** Pode sair da lista agora — ver `canReleaseSubscriptionSlot`. */
  releasable: boolean
  /**
   * Tirar da lista guarda o progresso? Decide o texto de confirmacao: dizer "o
   * progresso fica salvo" num curso que recomeca do zero seria mentir no
   * momento em que o aluno decide.
   */
  keepsProgress: boolean
}

/** O que a tela do assinante mostra das vagas (painel e seletor de troca). */
export interface SubscriptionSlots {
  max: number
  used: number
  courses: SubscriptionSlotCourse[]
}
