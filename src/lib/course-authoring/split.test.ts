import { describe, expect, it } from "vitest"
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  MIN_SELLER_COMMISSION_PERCENT,
  computeSplit,
  minSalePrice,
  producerNetAt,
  splitLinesForPayment,
  validateAuthorTerms,
  validateSalePrice,
  type AuthorTerms,
  type ComputeSplitInput,
  type SplitSnapshot,
} from "./split"

const PRODUCER = "tenant_produtor"
const SELLER = "tenant_vendedor"

function terms(over: Partial<AuthorTerms> = {}): AuthorTerms {
  return {
    pricingMode: "FIXED",
    authorAmount: 200,
    sellerCommissionPercent: 20,
    platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    ...over,
  }
}

function input(over: Partial<ComputeSplitInput> = {}): ComputeSplitInput {
  return {
    courseId: "curso_1",
    terms: terms(),
    listPrice: 200,
    producerTenantId: PRODUCER,
    producerWalletId: "wallet-produtor",
    sellerTenantId: SELLER,
    platformWalletId: "wallet-pmb",
    ...over,
  }
}

function ok(res: ReturnType<typeof computeSplit>): SplitSnapshot {
  if (!res.ok) throw new Error(`esperava sucesso, veio ${res.error}: ${res.message}`)
  return res.value
}

function byRole(snap: SplitSnapshot) {
  return Object.fromEntries(snap.lines.map((l) => [l.role, l])) as Record<
    "PRODUCER" | "SELLER" | "PLATFORM",
    (typeof snap.lines)[number]
  >
}

describe("termos do produtor", () => {
  it("recusa comissao abaixo do piso de 10%", () => {
    const res = validateAuthorTerms(terms({ sellerCommissionPercent: 9.99 }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("COMMISSION_BELOW_MINIMUM")
  })

  it("aceita exatamente o piso", () => {
    expect(
      validateAuthorTerms(terms({ sellerCommissionPercent: MIN_SELLER_COMMISSION_PERCENT })).ok,
    ).toBe(true)
  })

  it("recusa termos que nao deixam nada para o produtor", () => {
    const res = validateAuthorTerms(terms({ sellerCommissionPercent: 95 }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("COMMISSION_LEAVES_NOTHING_TO_PRODUCER")
  })

  it("recusa valor zerado ou negativo", () => {
    expect(validateAuthorTerms(terms({ authorAmount: 0 })).ok).toBe(false)
    expect(validateAuthorTerms(terms({ authorAmount: -1 })).ok).toBe(false)
  })
})

describe("preco aceitavel na vitrine de terceiro", () => {
  it("FIXED trava no valor do produtor", () => {
    const t = terms({ pricingMode: "FIXED", authorAmount: 200 })
    expect(validateSalePrice(t, 200).ok).toBe(true)
    const res = validateSalePrice(t, 250)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("PRICE_MUST_MATCH_FIXED")
  })

  it("MIN_PRICE aceita do piso para cima", () => {
    const t = terms({ pricingMode: "MIN_PRICE", authorAmount: 200 })
    expect(minSalePrice(t)).toBe(200)
    expect(validateSalePrice(t, 200).ok).toBe(true)
    expect(validateSalePrice(t, 999).ok).toBe(true)
    expect(validateSalePrice(t, 199.99).ok).toBe(false)
  })

  it("MIN_PRODUCER_NET exige preco que comporte comissao + taxa", () => {
    // 200 / (1 - 0,20 - 0,05) = 266,666… -> 266,67
    const t = terms({ pricingMode: "MIN_PRODUCER_NET", authorAmount: 200 })
    expect(minSalePrice(t)).toBe(266.67)
    expect(validateSalePrice(t, 266.67).ok).toBe(true)
    const res = validateSalePrice(t, 250)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("PRICE_BELOW_MINIMUM")
  })

  it("na propria loja o autor precifica como quiser", () => {
    const t = terms({ pricingMode: "FIXED", authorAmount: 200 })
    expect(validateSalePrice(t, 49, { sellerIsProducer: true }).ok).toBe(true)
  })
})

describe("rateio — vitrine do proprio autor", () => {
  it("nao gera linha nenhuma: 100% do produtor, sem os 5% da plataforma", () => {
    const snap = ok(computeSplit(input({ sellerTenantId: PRODUCER })))
    expect(snap.lines).toEqual([])
    expect(snap.salePrice).toBe(200)
  })

  it("dispensa carteira: nada viaja", () => {
    const res = computeSplit(
      input({ sellerTenantId: PRODUCER, producerWalletId: null, platformWalletId: null }),
    )
    expect(res.ok).toBe(true)
  })
})

describe("rateio — vitrine de outra unidade", () => {
  it("FIXED de R$200 com 20% de comissao: 40 / 10 / 150", () => {
    const snap = ok(computeSplit(input()))
    const l = byRole(snap)
    expect(l.SELLER.amount).toBe(40)
    expect(l.PLATFORM.amount).toBe(10)
    expect(l.PRODUCER.amount).toBe(150)
  })

  it("so o produtor e a plataforma viajam; o vendedor fica com o resto", () => {
    const l = byRole(ok(computeSplit(input())))
    expect(l.PRODUCER.travels).toBe(true)
    expect(l.PLATFORM.travels).toBe(true)
    // O vendedor EMITE a cobranca — mandar a carteira dele no split faz o Asaas
    // recusar a cobranca inteira.
    expect(l.SELLER.travels).toBe(false)
    expect(l.SELLER.walletId).toBeNull()
  })

  it("MIN_PRICE vendendo acima do piso: produtor e vendedor sobem juntos", () => {
    const snap = ok(
      computeSplit(
        input({
          terms: terms({ pricingMode: "MIN_PRICE", authorAmount: 200 }),
          listPrice: 400,
        }),
      ),
    )
    const l = byRole(snap)
    expect(l.SELLER.amount).toBe(80)
    expect(l.PLATFORM.amount).toBe(20)
    expect(l.PRODUCER.amount).toBe(300)
  })

  it("MIN_PRODUCER_NET: o produtor recebe o mesmo, a diferenca e do vendedor", () => {
    const t = terms({ pricingMode: "MIN_PRODUCER_NET", authorAmount: 200 })
    const a = byRole(ok(computeSplit(input({ terms: t, listPrice: 300 }))))
    expect(a.PRODUCER.amount).toBe(200)
    expect(a.PLATFORM.amount).toBe(15)
    expect(a.SELLER.amount).toBe(85)

    const b = byRole(ok(computeSplit(input({ terms: t, listPrice: 500 }))))
    expect(b.PRODUCER.amount).toBe(200) // nao muda
    expect(b.PLATFORM.amount).toBe(25)
    expect(b.SELLER.amount).toBe(275)
  })

  it("no piso do MIN_PRODUCER_NET o vendedor recebe exatamente a comissao minima", () => {
    const t = terms({
      pricingMode: "MIN_PRODUCER_NET",
      authorAmount: 200,
      sellerCommissionPercent: MIN_SELLER_COMMISSION_PERCENT,
    })
    const floor = minSalePrice(t) // 200 / 0,85 = 235,30
    const l = byRole(ok(computeSplit(input({ terms: t, listPrice: floor }))))
    expect(l.PRODUCER.amount).toBe(200)
    expect(l.SELLER.amount).toBeGreaterThanOrEqual(
      (floor * MIN_SELLER_COMMISSION_PERCENT) / 100 - 0.01,
    )
  })
})

describe("rateio — a PMB vende na vitrine dela", () => {
  it("a PMB fica com comissao + taxa, e so o produtor recebe split", () => {
    const snap = ok(computeSplit(input({ sellerTenantId: null })))
    const l = byRole(snap)
    expect(l.PRODUCER.amount).toBe(150)
    expect(l.PRODUCER.travels).toBe(true)
    // 20% de vendedor + 5% de plataforma = 50 retidos na conta-mae
    expect(l.SELLER.amount + l.PLATFORM.amount).toBe(50)
    expect(l.SELLER.travels).toBe(false)
    expect(l.PLATFORM.travels).toBe(false)
    expect(l.PLATFORM.walletId).toBeNull()
  })

  it("nao exige carteira da plataforma quando e ela quem emite", () => {
    expect(computeSplit(input({ sellerTenantId: null, platformWalletId: null })).ok).toBe(true)
  })
})

describe("desconto", () => {
  it("sai do bolso do vendedor: o produtor recebe o mesmo", () => {
    const t = terms({ pricingMode: "MIN_PRICE", authorAmount: 200 })
    const semDesconto = byRole(ok(computeSplit(input({ terms: t, listPrice: 200 }))))
    const comDesconto = byRole(
      ok(computeSplit(input({ terms: t, listPrice: 200, discount: 30 }))),
    )
    expect(comDesconto.PRODUCER.amount).toBe(semDesconto.PRODUCER.amount)
    expect(comDesconto.SELLER.amount).toBe(semDesconto.SELLER.amount - 30 + 1.5)
  })

  it("a taxa da plataforma incide sobre o COBRADO, nao sobre a tabela", () => {
    const t = terms({ pricingMode: "MIN_PRICE", authorAmount: 200 })
    const l = byRole(ok(computeSplit(input({ terms: t, listPrice: 200, discount: 30 }))))
    expect(l.PLATFORM.amount).toBe(8.5) // 5% de 170, nao de 200
  })

  it("recusa desconto que derrubaria a parte do vendedor abaixo de zero", () => {
    const t = terms({ pricingMode: "MIN_PRICE", authorAmount: 200 })
    const res = computeSplit(input({ terms: t, listPrice: 200, discount: 100 }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("DISCOUNT_EXCEEDS_SELLER_SHARE")
  })
})

describe("invariantes de dinheiro", () => {
  const cases: Array<[string, ComputeSplitInput]> = [
    ["FIXED / outra unidade", input()],
    ["FIXED / PMB vende", input({ sellerTenantId: null })],
    [
      "MIN_PRICE com desconto",
      input({ terms: terms({ pricingMode: "MIN_PRICE" }), listPrice: 333.33, discount: 11.11 }),
    ],
    [
      "MIN_PRODUCER_NET preco quebrado",
      input({
        terms: terms({ pricingMode: "MIN_PRODUCER_NET", authorAmount: 97 }),
        listPrice: 149.9,
      }),
    ],
    [
      "comissao com casa decimal",
      input({
        terms: terms({
          pricingMode: "MIN_PRICE",
          authorAmount: 100,
          sellerCommissionPercent: 33.33,
        }),
        listPrice: 199.99,
      }),
    ],
  ]

  it.each(cases)("%s: as partes somam exatamente o cobrado", (_label, inp) => {
    const snap = ok(computeSplit(inp))
    const total = snap.lines.reduce((acc, l) => acc + l.amount, 0)
    expect(Math.round(total * 100)).toBe(Math.round(snap.salePrice * 100))
  })

  it.each(cases)("%s: nenhuma parte fica negativa", (_label, inp) => {
    for (const line of ok(computeSplit(inp)).lines) {
      expect(line.amount).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("rateio por parcela", () => {
  it("aplica a mesma fatia ao valor de cada parcela do carne", () => {
    // R$600 em 6x de R$100, comissao 20%, taxa 5%
    const snap = ok(computeSplit(input({ terms: terms({ pricingMode: "MIN_PRICE" }), listPrice: 600 })))
    const parcela = splitLinesForPayment(snap, 100)
    const l = Object.fromEntries(parcela.map((x) => [x.role, x.amount]))
    expect(l.SELLER).toBe(20)
    expect(l.PLATFORM).toBe(5)
    expect(l.PRODUCER).toBe(75)
  })

  it("seis parcelas somam o rateio da venda inteira", () => {
    const snap = ok(computeSplit(input({ terms: terms({ pricingMode: "MIN_PRICE" }), listPrice: 600 })))
    const soma = { PRODUCER: 0, SELLER: 0, PLATFORM: 0 } as Record<string, number>
    for (let i = 0; i < 6; i++) {
      for (const line of splitLinesForPayment(snap, 100)) soma[line.role] += line.amount
    }
    for (const line of snap.lines) {
      expect(Math.round(soma[line.role] * 100)).toBe(Math.round(line.amount * 100))
    }
  })

  it("cada parcela fecha no valor pago, sem centavo perdido", () => {
    const snap = ok(
      computeSplit(input({ terms: terms({ pricingMode: "MIN_PRICE" }), listPrice: 333.33 })),
    )
    const parcela = splitLinesForPayment(snap, 111.11)
    const total = parcela.reduce((acc, l) => acc + l.amount, 0)
    expect(Math.round(total * 100)).toBe(11111)
  })

  it("venda na propria loja nao gera linha de parcela", () => {
    const snap = ok(computeSplit(input({ sellerTenantId: PRODUCER })))
    expect(splitLinesForPayment(snap, 100)).toEqual([])
  })
})

describe("simulador do painel", () => {
  it("producerNetAt responde o que o produtor recebe em cada modo", () => {
    expect(producerNetAt(terms({ pricingMode: "MIN_PRICE" }), 400)).toBe(300)
    expect(producerNetAt(terms({ pricingMode: "MIN_PRODUCER_NET", authorAmount: 200 }), 400)).toBe(200)
  })
})

describe("carteiras", () => {
  it("sem carteira do produtor o rateio nao e montado", () => {
    const res = computeSplit(input({ producerWalletId: null }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("PRODUCER_WALLET_MISSING")
  })

  it("sem carteira da plataforma o rateio nao e montado", () => {
    const res = computeSplit(input({ platformWalletId: null }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("PLATFORM_WALLET_MISSING")
  })
})
