/**
 * Marcador de clawback/freeze de comissão de indicação.
 *
 * Quando uma mensalidade que já gerou comissão é estornada (refund total de
 * comissão PAID) ou parcialmente estornada (freeze, SAAS-005), gravamos este
 * prefixo no `cancelReason` da comissão. Os gates de saque
 * (`requestPayout` + `processMonthlyPayouts`) bloqueiam novos payouts do
 * indicador enquanto QUALQUER comissão dele estiver marcada — até o financeiro
 * resolver manualmente. O prefixo é o contrato entre quem marca e quem bloqueia.
 */
export const CLAWBACK_MARKER_PREFIX = "[CLAWBACK_PENDING]" as const

/** True se um `cancelReason` carrega o marcador de clawback/freeze. */
export function isClawbackMarked(
  cancelReason: string | null | undefined,
): boolean {
  return cancelReason?.startsWith(CLAWBACK_MARKER_PREFIX) ?? false
}

/**
 * Decisão pura do gate de saque: o indicador está bloqueado se EXISTE pelo
 * menos uma comissão (de qualquer motor / qualquer status) com o marcador.
 * Espelha exatamente a cláusula `cancelReason: { startsWith: PREFIX }` das
 * queries de bloqueio em payout.ts — testável sem DB.
 */
export function hasClawbackBlock(
  commissions: Array<{ cancelReason?: string | null }>,
): boolean {
  return commissions.some((c) => isClawbackMarked(c.cancelReason))
}
