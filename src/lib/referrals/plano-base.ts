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
 * Fracao do mes que a unidade pagou, entre 0 e 1.
 *
 * TETO EM 1, e o teto nao e detalhe: sem ele, a unidade que quita DUAS faturas
 * no mesmo mes (a atrasada e a corrente) pagaria comissao dobrada por um mes so
 * — e a faixa e por unidade/mes, nao por fatura. O mesmo teto cobre a unidade
 * cujo plano de tabela nao bate com a flag de automacao.
 *
 * PISO EM 0 porque um valor negativo (estorno lancado como cobranca) nunca pode
 * virar comissao NEGATIVA silenciosa: estorno de comissao ja paga tem caminho
 * proprio (clawback), com revisao humana.
 *
 * Base <= 0 devolve 0: sem preco de tabela nao ha proporcao a calcular, e
 * dividir por zero pagaria Infinity.
 */
export function proporcaoPaga(recebidoNoMes: number, base: number): number {
  if (!Number.isFinite(recebidoNoMes) || !Number.isFinite(base)) return 0
  if (base <= 0 || recebidoNoMes <= 0) return 0
  return Math.min(recebidoNoMes / base, 1)
}
