/**
 * Parcelamento no cartao do Checkout Transparente (vendas de cursos aos alunos).
 *
 * Modelo do produto: o aluno SEMPRE pode dividir em ate 12x. O que cada unidade
 * configura (Tenant.interestFreeInstallments / SystemSettings.pmbInterestFreeInstallments)
 * e ate quantas dessas parcelas sao SEM JUROS (a loja absorve o juros ate ali).
 * Acima desse limite, o aluno paga o juros do cartao (emissor).
 *
 * Por isso sempre oferecemos 1..12. Quando o MP devolve os `payer_costs` reais
 * (getInstallments por BIN+valor), usamos os valores dele — fonte da verdade do
 * que sera cobrado. Quando o MP nao devolve uma quantidade (ou a consulta ainda
 * nao rodou), sintetizamos: sem juros = valor/n; com juros = valor/n + juros do
 * cartao (o valor exato aparece na fatura/MP).
 */

/** Teto absoluto de parcelas no cartao, independente de config. */
export const MAX_CARD_INSTALLMENTS = 12

/**
 * Nº de parcelas SEM JUROS a EXIBIR para uma compra à vista (ONE_TIME),
 * derivado do limite global da unidade — `Tenant.interestFreeInstallments`
 * (revenda) ou `SystemSettings.pmbInterestFreeInstallments` (PMB). É a fonte
 * ÚNICA da verdade do texto "Nx sem juros" no catálogo, na página do curso e no
 * resumo do pedido (mantém tudo coerente com o seletor do checkout).
 *
 * Retorna `null` quando não há parcelamento sem juros para anunciar (1 = só à
 * vista) ou o valor é inválido. Nunca passa do teto de 12x.
 */
export function displayInterestFreeInstallments(
  interestFree: number | null | undefined,
): number | null {
  const n = Math.trunc(interestFree ?? 0)
  if (!Number.isFinite(n) || n < 2) return null
  return Math.min(n, MAX_CARD_INSTALLMENTS)
}

/** Rótulo "Nx sem juros" (ou `null` quando não há parcela sem juros a anunciar). */
export function interestFreeLabel(
  interestFree: number | null | undefined,
): string | null {
  const n = displayInterestFreeInstallments(interestFree)
  return n ? `${n}x sem juros` : null
}

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
  /** true quando nao ha juros para o aluno nesta quantidade. */
  interestFree: boolean
  /** true quando o valor veio do MP (preciso); false = sintetizado. */
  fromMp: boolean
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
 * Monta SEMPRE 1..ceiling (<= 12) opcoes de parcelamento. Funde os `payer_costs`
 * reais do MP (quando presentes) com a sintese da loja:
 *  - n <= interestFreeInstallments  -> sem juros (valor/n), salvo se o MP indicar
 *    juros para essa quantidade (entao usamos a verdade do MP).
 *  - n  > interestFreeInstallments  -> com juros do cartao (valor do MP quando
 *    houver; senao valor/n + aviso de juros).
 */
export function buildInstallmentOptions(
  payerCosts: MpPayerCost[],
  opts: {
    amount: number
    maxInstallments?: number
    interestFreeInstallments?: number
  },
): InstallmentOption[] {
  const ceiling = Math.min(
    Math.max(1, opts.maxInstallments ?? MAX_CARD_INSTALLMENTS),
    MAX_CARD_INSTALLMENTS,
  )
  const free = Math.max(1, opts.interestFreeInstallments ?? 1)
  const amount = opts.amount

  const mpByN = new Map<number, MpPayerCost>()
  for (const c of payerCosts) {
    if (c.installments >= 1 && c.installments <= ceiling) {
      mpByN.set(c.installments, c)
    }
  }

  const options: InstallmentOption[] = []
  for (let n = 1; n <= ceiling; n++) {
    const mp = mpByN.get(n)

    if (n === 1) {
      const total = mp?.total_amount ?? amount
      options.push({
        installments: 1,
        installmentAmount: total,
        totalAmount: total,
        interestFree: true,
        fromMp: Boolean(mp),
        label: `À vista — ${formatBRL(total)}`,
      })
      continue
    }

    if (mp) {
      const interestFree = mp.installment_rate === 0
      options.push({
        installments: n,
        installmentAmount: mp.installment_amount,
        totalAmount: mp.total_amount,
        interestFree,
        fromMp: true,
        label: interestFree
          ? `${n}x de ${formatBRL(mp.installment_amount)} sem juros`
          : `${n}x de ${formatBRL(mp.installment_amount)} (total ${formatBRL(mp.total_amount)})`,
      })
      continue
    }

    // Sem dado do MP para esta quantidade: sintetiza pela politica da loja.
    const perInstallment = amount / n
    const interestFree = n <= free
    options.push({
      installments: n,
      installmentAmount: perInstallment,
      totalAmount: amount,
      interestFree,
      fromMp: false,
      label: interestFree
        ? `${n}x de ${formatBRL(perInstallment)} sem juros`
        : `${n}x de ${formatBRL(perInstallment)} + juros do cartão`,
    })
  }

  return options
}
