import type { CourseProvider, EnrollmentStatus, Prisma } from "@prisma/client"

/**
 * VAGAS da assinatura: quantos cursos o assinante pode ter EM ANDAMENTO ao
 * mesmo tempo.
 *
 * O plano pode cobrir o catalogo inteiro, mas o aluno estuda no maximo
 * `SUBSCRIPTION_MAX_ACTIVE_COURSES` por vez. Para abrir mais um, tira outro da
 * lista. TIRAR NAO E PERDER: a matricula e revogada na plataforma de aulas, que
 * guarda o progresso por aluno (e nao por matricula), e "Retomar" devolve o
 * curso de onde parou.
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
export const SUBSCRIPTION_SLOTS_RULE_TEXT = `Até ${SUBSCRIPTION_MAX_ACTIVE_COURSES} cursos em andamento ao mesmo tempo. Concluiu um ou tirou da lista, abre outro. O progresso fica salvo.`

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

/**
 * O aluno pode tirar este curso da lista?
 *
 * So da plataforma PROPRIA. Na plataforma legada desvincular APAGA o progresso
 * (`cancel.ts`), e nao existe pausa por curso — la o bloqueio e por login.
 * Cursos legados abertos antes da assinatura passar a liberar so a plataforma
 * propria continuam com o aluno e ocupando vaga, mas nao saem por aqui.
 */
export function canReleaseSubscriptionSlot(e: {
  status: EnrollmentStatus
  progressStatus: string | null
  provider: CourseProvider
}): boolean {
  return e.provider === "LMS" && occupiesSubscriptionSlot(e)
}

export interface SubscriptionSlotCourse {
  courseId: string
  nome: string
  progressPercent: number
  /** Pode sair da lista (so a plataforma propria — ver `canReleaseSubscriptionSlot`). */
  releasable: boolean
}

/** O que a tela do assinante mostra das vagas (painel e seletor de troca). */
export interface SubscriptionSlots {
  max: number
  used: number
  courses: SubscriptionSlotCourse[]
}
