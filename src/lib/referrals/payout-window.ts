/**
 * Janela de ANTECIPACAO da lista de pagamento de comissoes de indicacao.
 *
 * A comissao de uma competencia so e LIBERADA para a unidade no dia X do mes
 * seguinte (`availableAt`, ver `computeAvailableAt` em ./commission.ts). Ate
 * 09/2026 a lista de pagamento nascia no MESMO instante: o cron rodava so no
 * dia X e o financeiro descobria quanto havia a pagar naquele dia — nao existia
 * como antecipar um pagamento, porque o valor nao existia em lugar nenhum antes
 * do dia X.
 *
 * A partir daqui os dois eventos sao SEPARADOS:
 *   - dia 1  — o mes fecha, a comissao e apurada e a lista de pagamento e
 *              montada (ReferralPayout REQUESTED). O financeiro ja ve o valor.
 *   - dia X  — a comissao e LIBERADA (PENDING -> AVAILABLE), como sempre foi.
 *
 * A promessa feita a revenda ("liberado dia X") NAO muda: ela continua sendo o
 * prazo maximo, e deixa de ser tambem o piso. Por isso a antecipacao mexe so em
 * QUANDO o payout nasce — nunca no `status` da comissao, que e o que a unidade
 * ve no painel.
 *
 * Modulo PURO de proposito: e a regra de calendario, testavel sem banco.
 */

/**
 * Limite (EXCLUSIVO) da janela de antecipacao: o primeiro instante do mes
 * seguinte a `now`, em UTC.
 *
 * Le-se: "entra na lista de pagamento tudo o que vence DENTRO deste mes".
 * Rodando no dia 1, isso e exatamente a competencia que acabou de fechar (ela
 * vence no dia X deste mes). O que so vence no mes que vem fica de fora — nao e
 * antecipacao, e adiantamento de competencia nao apurada.
 *
 * UTC porque `availableAt` tambem e gravado em UTC (`setUTCHours(0,0,0,0)`):
 * comparar uma ponta em horario local com a outra em UTC erraria por um dia nas
 * viradas de mes.
 */
export function anticipationCutoff(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/**
 * Data prevista de liberacao do payout: a MAIOR `availableAt` entre as
 * comissoes que ele liquida.
 *
 * A maior, e nao a menor: o payout so estaria integralmente liberado quando a
 * ultima comissao dele vencesse. Mostrar a menor prometeria ao financeiro uma
 * data em que parte do valor ainda estaria retida.
 *
 * `null` so quando nao ha comissao nenhuma — caso que o chamador ja descarta.
 */
export function latestReleaseDate(availableAts: Date[]): Date | null {
  let max: Date | null = null
  for (const d of availableAts) {
    if (!max || d.getTime() > max.getTime()) max = d
  }
  return max
}

/**
 * O payout esta sendo ANTECIPADO? (foi montado antes da data de liberacao)
 *
 * Usado so para a copy: notificacao, `notes` e o rotulo da tela. A mecanica de
 * pagamento e a mesma nos dois casos.
 */
export function isAnticipatedPayout(dueAt: Date | null, now: Date): boolean {
  return Boolean(dueAt && dueAt.getTime() > now.getTime())
}
