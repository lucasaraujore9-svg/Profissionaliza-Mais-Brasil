/**
 * Regras de parcelamento do CHECKOUT PÚBLICO da vitrine principal (PMB, gateway
 * Asaas). Núcleo PURO — sem I/O — usado tanto pela UI (montar as opções do
 * seletor) quanto pelas rotas (validação server-side; nunca confiar no client).
 *
 * Não confundir com MIN/MAX_BOLETO_INSTALLMENTS de ./schedule.ts, que valem
 * para a venda direta MANUAL da revenda (operador escolhe valor/parcelas).
 * Aqui as regras são as da compra self-service pelo site:
 *   - boleto: cada parcela >= R$ 50 e no máximo 6 boletos;
 *   - cartão: sempre até 12x (modelo do produto: o aluno SEMPRE pode dividir;
 *     no Asaas o parcelamento é o valor total dividido — sem juros para o
 *     aluno), com cada parcela >= R$ 5 (mínimo do Asaas). A config do admin
 *     ("parcelas sem juros") é só o número ANUNCIADO nas vitrines — não limita
 *     o checkout.
 */

/** Valor mínimo de CADA boleto do parcelamento self-service. */
export const PMB_BOLETO_MIN_PARCELA = 50

/** Máximo de boletos do parcelamento self-service. */
export const PMB_BOLETO_MAX_PARCELAS = 6

/** Mínimo do Asaas por parcela no cartão. */
export const PMB_CARD_MIN_PARCELA = 5

/** Teto de parcelas no cartão (independe da config do admin). */
export const PMB_CARD_ABS_MAX = 12

/**
 * Máximo de boletos permitido para um total: clamp(floor(total/50), 1, 6).
 * 1 = só à vista (sem opção de parcelamento). Ex.: R$100 → 2x; R$1.000 → 6x;
 * R$99,99 → 1x.
 */
export function pmbMaxBoletoInstallments(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  const byMinValue = Math.floor(total / PMB_BOLETO_MIN_PARCELA)
  return Math.max(1, Math.min(byMinValue, PMB_BOLETO_MAX_PARCELAS))
}

/**
 * Máximo de parcelas no cartão para um total: sempre até 12x, limitado apenas
 * pela parcela mínima de R$ 5 (regra do Asaas). NÃO depende da config do admin
 * — "parcelas sem juros" é exibição, nunca gate de disponibilidade.
 */
export function pmbMaxCardInstallments(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  const byMinValue = Math.floor(total / PMB_CARD_MIN_PARCELA)
  return Math.max(1, Math.min(byMinValue, PMB_CARD_ABS_MAX))
}

/**
 * Valor de exibição/envio de cada parcela: round(total/n, 2). O `totalValue`
 * exato acompanha na chamada ao Asaas, que reconcilia a última parcela — sem
 * drift de centavos (ex.: 6×166,67 ≠ 1.000,00).
 */
export function perInstallment(total: number, n: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const count = Math.max(1, Math.floor(n))
  return Math.round((total / count) * 100) / 100
}
