/**
 * Valor CHEIO do plano de revenda — o denominador da comissao proporcional.
 *
 * A comissao de valor FIXO (R$ X por unidade) e proporcional ao que a PMB de
 * fato recebeu daquela unidade no mes:
 *
 *     comissao da unidade = rate x (recebido no mes / valor cheio do plano)
 *
 * Sem isso, uma unidade com cortesia de 50% pagava metade para a PMB e o
 * indicador recebia os R$ 75 inteiros — a PMB rateava sobre receita que nao
 * entrou. Com a regra, ele recebe R$ 37,50: o desconto e dividido, nao
 * absorvido so por um lado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O DENOMINADOR NAO E `Tenant.planValue`  ← nao "simplifique" isto
 *
 * `planValue` e a mensalidade de HOJE, e e exatamente onde a cortesia e gravada
 * (a rota de billing o sobrescreve sem historico — a mesma armadilha que
 * lib/tenants/lifecycle.ts documenta para o churn). Usa-lo como denominador
 * daria `recebido / planValue = 1` para TODA unidade com desconto: a regra
 * viraria no-op justo no caso que ela existe para cobrir.
 *
 * O denominador tem de ser o preco de TABELA. Sao dois planos (decisao do dono):
 * Profissionaliza R$ 209 e PRO R$ 239, este com o modulo Automacao.
 */

export const PLANO_BASE_PRO = 239
export const PLANO_BASE_PROFISSIONALIZA = 209

/**
 * `automationEnabled` e o discriminador do plano PRO: e a flag que liga o modulo
 * que justifica a diferenca de preco. Nao e perfeito — em producao ha unidade
 * com a flag desligada pagando R$ 239 e vice-versa —, e por isso a proporcao
 * tem TETO: no pior caso o indicador recebe a faixa cheia, nunca mais.
 */
export function valorBasePlano(automationEnabled: boolean): number {
  return automationEnabled ? PLANO_BASE_PRO : PLANO_BASE_PROFISSIONALIZA
}

/**
 * Fracao que UMA fatura paga da faixa, entre 0 e 1.
 *
 * TETO EM 1 POR FATURA — e o teto existe para JUROS E MULTA: a fatura em atraso
 * chega com valor maior que a mensalidade, e o acrescimo e do gateway e da PMB,
 * nao receita de revenda a ratear.
 *
 * PISO EM 0 porque um valor negativo (estorno lancado como cobranca) nunca pode
 * virar comissao NEGATIVA silenciosa: estorno de comissao ja paga tem caminho
 * proprio (clawback), com revisao humana.
 *
 * Base <= 0 devolve 0: sem preco de tabela nao ha proporcao a calcular, e
 * dividir por zero pagaria Infinity.
 */
export function proporcaoPaga(valorDaFatura: number, base: number): number {
  if (!Number.isFinite(valorDaFatura) || !Number.isFinite(base)) return 0
  if (base <= 0 || valorDaFatura <= 0) return 0
  return Math.min(valorDaFatura / base, 1)
}

/**
 * Quanto da faixa a unidade vale no mes: a SOMA das fracoes, uma por fatura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O TETO E POR FATURA, NUNCA SOBRE A SOMA  ← nao "simplifique" para um min() no
 * total.
 *
 * Duas mensalidades podem cair na MESMA competencia: a de agosto paga com atraso
 * em 05/09 e a de setembro paga no dia 30/09 sao duas receitas, e a competencia
 * de ambas e setembro (`max(vencimento, pagamento)`). Um teto sobre a soma
 * pagaria UMA — e a mensalidade atrasada, que ja nao gerou comissao no mes dela
 * justamente por ter atrasado, NUNCA geraria comissao nenhuma. O indicador
 * perderia o repasse porque o cliente dele pagou tarde.
 *
 * Foi assim que esta funcao nasceu errada (09/09/2026): o comentario dizia "a
 * faixa e por unidade/mes, nao por fatura", o que deixou de valer no momento em
 * que a competencia passou a poder juntar duas faturas no mesmo mes.
 *
 * Uma mensalidade quitada em duas partes continua valendo 1 (0,5 + 0,5) — o que
 * a soma preserva e a RECEITA, nao a contagem de boletos.
 */
export function proporcaoDoMes(
  valoresDasFaturas: readonly number[],
  base: number,
): number {
  let total = 0
  for (const valor of valoresDasFaturas) total += proporcaoPaga(valor, base)
  return total
}
