/**
 * RATEIO DE VENDA DE CURSO DE AUTORIA — fonte unica da regra.
 *
 * Modulo PURO (sem I/O, sem Prisma): e importado pelos formularios do painel
 * para o simulador "vendendo por R$ X voce recebe R$ Y", entao qualquer import
 * de servidor viria junto no bundle do browser. O que toca o banco mora em
 * `./split-server.ts`.
 *
 * ── O modelo ──────────────────────────────────────────────────────────────
 * Tres papeis numa venda: PRODUTOR (quem criou o curso), VENDEDOR (dono da
 * vitrine onde a compra aconteceu) e PLATAFORMA (PMB, pela intermediacao).
 *
 *   Vitrine do proprio autor  -> produtor 100%, SEM rateio e SEM taxa da PMB
 *   Vitrine de outra unidade  -> vendedor c% (>= 10) - PMB f% - produtor o resto
 *   Vitrine PMB               -> a PMB e o vendedor: fica com c% + f%
 *
 * Quem EMITE a cobranca e sempre a vitrine que vendeu (decisao do dono). Isso
 * mantem intacto o invariante de `assert-tenant-gateway.ts`: `Payment.tenantId`
 * continua sendo o tenant da matricula, e o dinheiro so cruza tenants pelas
 * linhas de split, que sao explicitas e auditaveis. Consequencia direta: o
 * vendedor fica com o RESTO (nao viaja split para a propria carteira — o Asaas
 * lanca excecao se a carteira do emissor vier no array).
 *
 * ── Desconto ──────────────────────────────────────────────────────────────
 * A parte do produtor e calculada sobre o preco DE TABELA; a taxa da PMB, sobre
 * o valor efetivamente COBRADO ("5% da transacao"). O vendedor absorve o resto
 * — e portanto o desconto inteiro. Sem isso, um cupom de 50% faria o produtor
 * pagar por uma promocao que ele nao autorizou.
 *
 * ── O que o Asaas faz com estes numeros ───────────────────────────────────
 * `percentualValue` la e aplicado sobre o valor LIQUIDO (depois da tarifa
 * deles), nao sobre o bruto. Ou seja: a tarifa do gateway acaba RATEADA
 * proporcionalmente entre os tres. Os valores calculados aqui sao portanto o
 * ESPERADO sobre o bruto, e o creditado costuma ser alguns centavos menor. Foi
 * uma escolha: valor percentual nunca estoura o liquido e nunca derruba a
 * cobranca, enquanto `fixedValue` pode exceder o liquido e bloquear o split.
 */

/** Piso inegociavel de comissao para quem vende curso de terceiro. */
export const MIN_SELLER_COMMISSION_PERCENT = 10

/** Taxa da plataforma pela intermediacao e distribuicao. */
export const DEFAULT_PLATFORM_FEE_PERCENT = 5

export type AuthoredPricingMode = "FIXED" | "MIN_PRICE" | "MIN_PRODUCER_NET"

export type SplitRole = "PRODUCER" | "SELLER" | "PLATFORM"

/** Termos comerciais que o produtor define no curso. */
export interface AuthorTerms {
  pricingMode: AuthoredPricingMode
  /**
   * FIXED            -> o preco final, igual em toda vitrine
   * MIN_PRICE        -> o piso de preco
   * MIN_PRODUCER_NET -> quanto o produtor recebe por venda
   */
  authorAmount: number
  sellerCommissionPercent: number
  platformFeePercent: number
}

export interface SplitLine {
  role: SplitRole
  /** null = PMB, seguindo a convencao de Payment.tenantId/Enrollment.tenantId. */
  beneficiaryTenantId: string | null
  /** Carteira Asaas de destino. Null quando a linha nao viaja. */
  walletId: string | null
  /** Fatia do valor COBRADO que cabe a este papel. */
  percentOfSale: number
  /** Valor esperado sobre o bruto desta venda. */
  amount: number
  /**
   * A linha vira um item do array `splits` do Asaas? Falso para o vendedor
   * (que e o emissor e fica com o resto) e para a PMB quando ela mesma vende.
   */
  travels: boolean
}

/** Termos + partes congelados no checkout e gravados em `Enrollment.authorSplitSnapshot`. */
export interface SplitSnapshot {
  /** Versao do formato — o dia em que um campo mudar, o passado continua legivel. */
  version: 1
  courseId: string
  producerTenantId: string
  /** null = a PMB vendeu (vitrine principal). */
  sellerTenantId: string | null
  terms: AuthorTerms
  listPrice: number
  salePrice: number
  lines: SplitLine[]
}

export type SplitError =
  | "AUTHOR_AMOUNT_INVALID"
  | "COMMISSION_BELOW_MINIMUM"
  | "COMMISSION_LEAVES_NOTHING_TO_PRODUCER"
  | "PLATFORM_FEE_INVALID"
  | "PRICE_BELOW_MINIMUM"
  | "PRICE_MUST_MATCH_FIXED"
  | "PRICE_INVALID"
  | "DISCOUNT_EXCEEDS_SELLER_SHARE"
  | "PRODUCER_WALLET_MISSING"
  | "PLATFORM_WALLET_MISSING"

export type SplitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SplitError; message: string }

const fail = (error: SplitError, message: string): SplitResult<never> => ({
  ok: false,
  error,
  message,
})

/** Reais -> centavos, sem o drift de ponto flutuante de `x * 100`. */
function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

/** Duas casas, arredondando para CIMA — usado em piso de preco. */
function ceil2(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 100) / 100
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
}

// ── Termos do produtor ──────────────────────────────────────────────────────

/**
 * Valida o que o produtor digitou no curso. Chamada na criacao E na edicao —
 * um termo invalido gravado seria descoberto so no primeiro checkout, com o
 * aluno na tela.
 */
export function validateAuthorTerms(terms: AuthorTerms): SplitResult<AuthorTerms> {
  if (!isMoney(terms.authorAmount)) {
    return fail("AUTHOR_AMOUNT_INVALID", "Informe um valor maior que zero.")
  }
  if (!isPercent(terms.platformFeePercent)) {
    return fail("PLATFORM_FEE_INVALID", "Taxa da plataforma invalida.")
  }
  if (!isPercent(terms.sellerCommissionPercent)) {
    return fail("COMMISSION_BELOW_MINIMUM", "Comissao invalida.")
  }
  if (terms.sellerCommissionPercent < MIN_SELLER_COMMISSION_PERCENT) {
    return fail(
      "COMMISSION_BELOW_MINIMUM",
      `A comissao de quem vender nao pode ser menor que ${MIN_SELLER_COMMISSION_PERCENT}%.`,
    )
  }
  // O produtor precisa sobrar com ALGO. Nao ha teto de negocio aqui (ele pode
  // ser generoso), so a garantia de que a conta fecha.
  if (terms.sellerCommissionPercent + terms.platformFeePercent >= 100) {
    return fail(
      "COMMISSION_LEAVES_NOTHING_TO_PRODUCER",
      `Comissao + taxa da plataforma (${terms.platformFeePercent}%) precisam somar menos de 100%.`,
    )
  }
  return { ok: true, value: terms }
}

/**
 * Menor preco de venda aceitavel numa vitrine de TERCEIRO.
 *
 * Em MIN_PRODUCER_NET o produtor recebe um valor fixo, entao o preco precisa
 * ser alto o bastante para que a comissao minima e a taxa da plataforma caibam
 * SEM comer esse valor: authorAmount / (1 - c - f).
 */
export function minSalePrice(terms: AuthorTerms): number {
  if (terms.pricingMode !== "MIN_PRODUCER_NET") return terms.authorAmount
  const share = (100 - terms.sellerCommissionPercent - terms.platformFeePercent) / 100
  if (share <= 0) return Number.POSITIVE_INFINITY
  return ceil2(terms.authorAmount / share)
}

/**
 * Valida o preco que a unidade VENDEDORA escolheu (o `TenantCourse.price`).
 *
 * `sellerIsProducer`: na propria loja o autor precifica como quiser — ninguem
 * mais e afetado, e nao ha rateio.
 */
export function validateSalePrice(
  terms: AuthorTerms,
  price: number,
  opts: { sellerIsProducer?: boolean } = {},
): SplitResult<number> {
  if (!isMoney(price)) {
    return fail("PRICE_INVALID", "Informe um preco maior que zero.")
  }
  if (opts.sellerIsProducer) return { ok: true, value: price }

  if (terms.pricingMode === "FIXED") {
    if (toCents(price) !== toCents(terms.authorAmount)) {
      return fail(
        "PRICE_MUST_MATCH_FIXED",
        `Este curso tem preco fixo definido pelo produtor: ${formatBRL(terms.authorAmount)}.`,
      )
    }
    return { ok: true, value: price }
  }

  const floor = minSalePrice(terms)
  if (toCents(price) < toCents(floor)) {
    return fail(
      "PRICE_BELOW_MINIMUM",
      `O preco minimo definido pelo produtor e ${formatBRL(floor)}.`,
    )
  }
  return { ok: true, value: price }
}

// ── O rateio ────────────────────────────────────────────────────────────────

export interface ComputeSplitInput {
  courseId: string
  terms: AuthorTerms
  /** Preco de tabela na vitrine (antes de cupom/desconto). */
  listPrice: number
  /** Desconto aplicado nesta venda. Sai INTEIRO do bolso do vendedor. */
  discount?: number
  producerTenantId: string
  producerWalletId: string | null
  /** null = a PMB e a vendedora (vitrine principal). */
  sellerTenantId: string | null
  platformWalletId: string | null
}

/**
 * Monta o rateio de UMA venda.
 *
 * Devolve `lines: []` quando quem vende e o proprio autor — a regra dos 100%
 * mora aqui, num lugar so, e nao espalhada pelos oito checkouts.
 */
export function computeSplit(input: ComputeSplitInput): SplitResult<SplitSnapshot> {
  const termsCheck = validateAuthorTerms(input.terms)
  if (!termsCheck.ok) return termsCheck

  const sellerIsProducer = input.sellerTenantId === input.producerTenantId
  const priceCheck = validateSalePrice(input.terms, input.listPrice, { sellerIsProducer })
  if (!priceCheck.ok) return priceCheck

  const discount = input.discount ?? 0
  if (discount < 0 || !Number.isFinite(discount)) {
    return fail("PRICE_INVALID", "Desconto invalido.")
  }

  const listCents = toCents(input.listPrice)
  const saleCents = listCents - toCents(discount)
  if (saleCents <= 0) {
    return fail("PRICE_INVALID", "O valor cobrado precisa ser maior que zero.")
  }

  const base: Omit<SplitSnapshot, "lines"> = {
    version: 1,
    courseId: input.courseId,
    producerTenantId: input.producerTenantId,
    sellerTenantId: input.sellerTenantId,
    terms: input.terms,
    listPrice: input.listPrice,
    salePrice: fromCents(saleCents),
  }

  // Vitrine do proprio autor: 100% dele, sem split e sem taxa da plataforma.
  if (sellerIsProducer) return { ok: true, value: { ...base, lines: [] } }

  if (!input.producerWalletId) {
    return fail(
      "PRODUCER_WALLET_MISSING",
      "O produtor deste curso ainda nao conectou a conta Asaas que recebe o repasse.",
    )
  }

  const sellerIsPmb = input.sellerTenantId === null

  // A PMB so precisa de carteira quando NAO e ela quem emite: vendendo na
  // vitrine dela, a fatia da plataforma fica retida na conta-mae.
  if (!sellerIsPmb && !input.platformWalletId) {
    return fail(
      "PLATFORM_WALLET_MISSING",
      "A carteira da plataforma nao esta configurada — o rateio nao pode ser montado.",
    )
  }

  // Produtor: sobre o preco DE TABELA (nao absorve desconto do vendedor).
  const producerCents =
    input.terms.pricingMode === "MIN_PRODUCER_NET"
      ? toCents(input.terms.authorAmount)
      : Math.round(
          (listCents *
            (100 - input.terms.sellerCommissionPercent - input.terms.platformFeePercent)) /
            100,
        )

  // Plataforma: sobre a TRANSACAO (o valor efetivamente cobrado).
  const platformCents = Math.round((saleCents * input.terms.platformFeePercent) / 100)

  // Vendedor: o resto. E ele quem emite a cobranca, entao fica com o residuo de
  // arredondamento por construcao — as tres linhas somam o cobrado EXATAMENTE.
  const sellerCents = saleCents - producerCents - platformCents

  if (sellerCents < 0) {
    return fail(
      "DISCOUNT_EXCEEDS_SELLER_SHARE",
      "O desconto e maior que a sua comissao nesta venda.",
    )
  }

  const pct = (cents: number) => Math.round((cents / saleCents) * 1_000_000) / 10_000

  const lines: SplitLine[] = [
    {
      role: "PRODUCER",
      beneficiaryTenantId: input.producerTenantId,
      walletId: input.producerWalletId,
      percentOfSale: pct(producerCents),
      amount: fromCents(producerCents),
      travels: true,
    },
    {
      role: "PLATFORM",
      beneficiaryTenantId: null,
      // Quando a PMB e a vendedora ela ja e a emissora: a fatia dela fica retida,
      // e mandar a propria carteira no split faz o Asaas recusar a cobranca.
      walletId: sellerIsPmb ? null : input.platformWalletId,
      percentOfSale: pct(platformCents),
      amount: fromCents(platformCents),
      travels: !sellerIsPmb,
    },
    {
      role: "SELLER",
      beneficiaryTenantId: input.sellerTenantId,
      walletId: null,
      percentOfSale: pct(sellerCents),
      amount: fromCents(sellerCents),
      travels: false,
    },
  ]

  return { ok: true, value: { ...base, lines } }
}

/**
 * Valores de cada papel para UM pagamento.
 *
 * Existe porque um carne de 6x gera seis `Payment`: o rateio de cada parcela e
 * a mesma FATIA aplicada ao valor daquela parcela — que e exatamente o que o
 * Asaas faz com `percentualValue` em parcelamento. Se o aluno parar na 3a de 6,
 * produtor e vendedor receberam a fatia das 3 pagas, sem clawback.
 */
export function splitLinesForPayment(
  snapshot: SplitSnapshot,
  paidAmount: number,
): SplitLine[] {
  if (snapshot.lines.length === 0) return []
  const paidCents = toCents(paidAmount)

  const producer = snapshot.lines.find((l) => l.role === "PRODUCER")
  const platform = snapshot.lines.find((l) => l.role === "PLATFORM")
  const seller = snapshot.lines.find((l) => l.role === "SELLER")
  if (!producer || !platform || !seller) return []

  const producerCents = Math.round((paidCents * producer.percentOfSale) / 100)
  const platformCents = Math.round((paidCents * platform.percentOfSale) / 100)
  const sellerCents = paidCents - producerCents - platformCents

  return [
    { ...producer, amount: fromCents(producerCents) },
    { ...platform, amount: fromCents(platformCents) },
    { ...seller, amount: fromCents(sellerCents) },
  ]
}

/** Quanto o produtor recebe vendendo por `price` numa vitrine de terceiro. */
export function producerNetAt(terms: AuthorTerms, price: number): number {
  if (terms.pricingMode === "MIN_PRODUCER_NET") return terms.authorAmount
  const cents = Math.round(
    (toCents(price) * (100 - terms.sellerCommissionPercent - terms.platformFeePercent)) / 100,
  )
  return fromCents(cents)
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}
