import type { SubscriptionStatus } from "@prisma/client"

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
  /** Fim do ciclo pago. null = nunca houve ciclo pago. */
  currentPeriodEnd: Date | null
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
  if (!sub.currentPeriodEnd) return false
  return !subscriptionGrantsAccess(sub, now)
}
