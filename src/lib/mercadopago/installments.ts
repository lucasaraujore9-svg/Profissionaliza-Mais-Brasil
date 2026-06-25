/**
 * Parcelamento no cartao do Checkout Transparente (vendas de cursos aos alunos).
 *
 * O teto de parcelas oferecido e SEMPRE 12x. O que cada unidade configura
 * (Tenant.interestFreeInstallments / SystemSettings.pmbInterestFreeInstallments)
 * e ate quantas parcelas ela ANUNCIA como "sem juros". A verdade do valor de
 * cada parcela vem do Mercado Pago (`payer_costs` do endpoint getInstallments),
 * que reflete o financiamento configurado na conta MP — por isso somos "fieis"
 * ao MP: o que o aluno ve e exatamente o que sera cobrado.
 */

/** Teto absoluto de parcelas no cartao, independente de config. */
export const MAX_CARD_INSTALLMENTS = 12

/** Uma opcao de parcelamento devolvida pelo MP (`payer_costs[]`). */
export interface MpPayerCost {
  installments: number
  installment_rate: number
  /** Valor de cada parcela (ja com juros do emissor, quando houver). */
  installment_amount: number
  /** Valor total cobrado (parcelas x valor da parcela). */
  total_amount: number
  recommended_message?: string
}

/** Opcao normalizada para exibir no <select> do checkout. */
export interface InstallmentOption {
  installments: number
  /** Valor de cada parcela. */
  installmentAmount: number
  /** Valor total (== amount quando sem juros). */
  totalAmount: number
  /** true quando o MP confirma juros 0 para esta quantidade. */
  interestFree: boolean
  /** Rotulo pronto para exibir (BRL). */
  label: string
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/**
 * Normaliza os `payer_costs` do MP em opcoes exibiveis, respeitando o teto de
 * 12x. O parametro `interestFreeInstallments` e o "anuncio" comercial da unidade:
 * usamos a verdade do MP para o valor, mas so rotulamos como "sem juros" o que o
 * MP confirma como juros 0 — nunca prometemos sem juros quando o MP cobra juros.
 */
export function buildInstallmentOptions(
  payerCosts: MpPayerCost[],
  opts: { maxInstallments?: number },
): InstallmentOption[] {
  const ceiling = Math.min(opts.maxInstallments ?? MAX_CARD_INSTALLMENTS, MAX_CARD_INSTALLMENTS)

  return payerCosts
    .filter((c) => c.installments >= 1 && c.installments <= ceiling)
    .sort((a, b) => a.installments - b.installments)
    .map((c) => {
      const interestFree = c.installment_rate === 0
      const n = c.installments
      const label =
        n === 1
          ? `À vista — ${formatBRL(c.total_amount)}`
          : interestFree
            ? `${n}x de ${formatBRL(c.installment_amount)} sem juros`
            : `${n}x de ${formatBRL(c.installment_amount)} (total ${formatBRL(c.total_amount)})`
      return {
        installments: n,
        installmentAmount: c.installment_amount,
        totalAmount: c.total_amount,
        interestFree,
        label,
      }
    })
}
