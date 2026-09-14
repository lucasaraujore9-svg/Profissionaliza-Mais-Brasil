import type { SubscriptionInterval, SubscriptionStatus } from "@prisma/client"
import { isRecurringInterval } from "./interval"

/**
 * Quando uma assinatura da acesso.
 *
 * PURO e separado das queries porque a resposta e consultada em quatro lugares
 * (vitrine do assinante, gate de liberacao, SSO e o cron de carencia) e uma
 * segunda leitura da regra abriria acesso onde a outra fecha.
 */

/**
 * Dias de tolerancia depois do fim do ciclo antes de cortar. Mesma ordem de
 * grandeza do `STUDENT_GRACE_DAYS = 5` do sweep de inadimplencia do aluno.
 *
 * A carencia existe porque PIX e boleto NAO tem debito automatico: a fatura do
 * ciclo e emitida e o aluno paga na mao. Cortar no primeiro dia de atraso
 * derrubaria quem so pagou com um dia de folga.
 */
export const SUBSCRIPTION_GRACE_DAYS = 7

/** O minimo que a decisao precisa saber da assinatura. */
export interface SubscriptionAccessInput {
  status: SubscriptionStatus
  /** Fim do ciclo pago. null = nunca houve ciclo pago (ou e vitalicia). */
  currentPeriodEnd: Date | null
  /**
   * Periodicidade CONGELADA na contratacao. Campo obrigatorio de proposito: o
   * compilador passa a exigi-lo em todo `select` que alimenta esta decisao, e e
   * isso que impede uma consulta nova de esquecer o vitalicio e cortar o acesso
   * de quem pagou uma vez por acesso permanente.
   */
  interval: SubscriptionInterval
}

/**
 * Status que ainda podem liberar. `PENDING` NAO entra: a assinatura foi criada
 * mas o 1o pagamento nao confirmou — liberar ali daria o catalogo inteiro a
 * quem so abriu o checkout.
 */
const LIVE_STATUSES: SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"]

/**
 * A assinatura esta valendo agora?
 *
 * Decide pelo PRAZO, nao pelo status sozinho. Sao coisas diferentes: `status` e
 * o que o gateway informou por ultimo (e pode estar atrasado — webhook perdido,
 * cron que ainda nao rodou), enquanto `currentPeriodEnd` e ate quando o dinheiro
 * que ja entrou cobre. Uma assinatura ACTIVE cujo ciclo venceu ha duas semanas
 * nao pode continuar liberando so porque ninguem processou a queda.
 */
export function subscriptionGrantsAccess(
  sub: SubscriptionAccessInput,
  now: Date = new Date(),
): boolean {
  if (!LIVE_STATUSES.includes(sub.status)) return false

  // VITALICIA: nao ha prazo a conferir, e ai o status E a verdade — ele so
  // chega a ACTIVE depois do pagamento unico ser confirmado. Exige ACTIVE
  // estrito: `PAST_DUE` nao pode aparecer num produto sem ciclo, e aceita-lo
  // aqui abriria acesso a partir de qualquer marcacao equivocada de atraso.
  if (!isRecurringInterval(sub.interval)) return sub.status === "ACTIVE"

  if (!sub.currentPeriodEnd) return false

  const deadline = new Date(sub.currentPeriodEnd)
  deadline.setUTCDate(deadline.getUTCDate() + SUBSCRIPTION_GRACE_DAYS)
  return now.getTime() <= deadline.getTime()
}

/**
 * Passou da carencia e deve ser CANCELADA (nao apenas marcada em atraso).
 *
 * O cancelamento e o que dispara o corte na fornecedora — e, na EA, isso APAGA
 * o progresso do aluno naquele curso (desvincular e revincular zera; ver
 * `plataforma-actions.ts`). Por isso a decisao mora aqui sozinha, e nao colada
 * a "esta em atraso": atraso e reversivel, cancelamento nao.
 */
export function subscriptionShouldCancel(
  sub: SubscriptionAccessInput,
  now: Date = new Date(),
): boolean {
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") return false
  // VITALICIA nunca vence. Sem esta linha bastaria alguem gravar um
  // `currentPeriodEnd` por engano para a varredura cancelar — e cancelamento de
  // assinatura REVOGA o curso na fornecedora legada, o que APAGA o progresso do
  // aluno. Fail-closed no sentido que protege quem pagou.
  if (!isRecurringInterval(sub.interval)) return false
  if (!sub.currentPeriodEnd) return false
  return !subscriptionGrantsAccess(sub, now)
}

/**
 * Status das matriculas que ainda dao acesso na fornecedora — as que o corte de
 * uma assinatura encerrada precisa alcancar. COMPLETED entra: o SSO aceita
 * matricula concluida, e deixa-la de fora manteria o acesso de quem mais usou.
 */
export const LIVE_ENROLLMENT_STATUSES = ["ACTIVE", "COMPLETED", "PENDING", "SUSPENDED"] as const

/**
 * Assinatura JA ENCERRADA (cancelada pelo aluno, estornada, expirada) cujo
 * periodo pago acabou — os cursos que ela abriu tem de ser cortados agora.
 *
 * Existe porque o cancelamento pedido pelo aluno mantem o acesso ate o fim do
 * ciclo ja pago (`revokeAccess: false`) e alguem precisa cortar no dia certo. A
 * varredura de carencia nao serve: ela so olha ACTIVE/PAST_DUE.
 *
 * Sem prazo de carencia de proposito: a carencia existe para quem PAGA atrasado,
 * e quem cancelou nao vai pagar mais nada.
 */
export function endedSubscriptionAccessExpired(
  sub: SubscriptionAccessInput,
  now: Date = new Date(),
): boolean {
  if (sub.status !== "CANCELLED" && sub.status !== "EXPIRED") return false
  // VITALICIA nunca e cortada por prazo: o encerramento dela (estorno) ja revoga
  // na hora, e um corte automatico aqui apagaria progresso de quem pagou uma vez.
  if (!isRecurringInterval(sub.interval)) return false
  // Sem ciclo pago nenhum: nao ha periodo a respeitar.
  if (!sub.currentPeriodEnd) return true
  return now.getTime() >= sub.currentPeriodEnd.getTime()
}
