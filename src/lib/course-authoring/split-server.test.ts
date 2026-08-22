import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { buildAsaasSplits, parseSplitSnapshot, saleRequiresSplit, isAuthoredCourse } =
  await import("./split-server")
const { computeSplit } = await import("./split")

const PRODUCER = "t_produtor"
const SELLER = "t_vendedor"

function snapshot(sellerTenantId: string | null) {
  const res = computeSplit({
    courseId: "c1",
    terms: {
      pricingMode: "FIXED",
      authorAmount: 200,
      sellerCommissionPercent: 20,
      platformFeePercent: 5,
    },
    listPrice: 200,
    producerTenantId: PRODUCER,
    producerWalletId: "w_prod",
    sellerTenantId,
    platformWalletId: "w_pmb",
  })
  if (!res.ok) throw new Error(res.message)
  return res.value
}

describe("array splits do Asaas", () => {
  it("manda o produtor e a plataforma, nunca o vendedor", () => {
    const splits = buildAsaasSplits(snapshot(SELLER))
    expect(splits).toHaveLength(2)
    // A carteira do EMISSOR no array faz a API do Asaas recusar a cobranca
    // inteira — o vendedor fica com o resto liquido por padrao.
    expect(splits?.map((s) => s.walletId)).toEqual(["w_prod", "w_pmb"])
  })

  it("`travels: false` exclui a linha MESMO com carteira preenchida", () => {
    // Hoje `computeSplit` zera a carteira de quem nao viaja, entao o filtro por
    // walletId sozinho ja bastaria — e por isso este caso e construido a mao.
    // `travels` e a fonte da verdade: no dia em que a linha retida passar a
    // carregar carteira (para o extrato dizer PARA ONDE o dinheiro FICOU), o
    // filtro por walletId mandaria a carteira do emissor e o Asaas recusaria a
    // cobranca inteira.
    const snap = snapshot(SELLER)
    const comCarteiraRetida = {
      ...snap,
      lines: snap.lines.map((l) =>
        l.role === "SELLER" ? { ...l, walletId: "w_vendedor" } : l,
      ),
    }
    const splits = buildAsaasSplits(comCarteiraRetida)
    expect(splits?.map((s) => s.walletId)).not.toContain("w_vendedor")
    expect(splits).toHaveLength(2)
  })

  it("snapshot em que NADA viaja devolve undefined, nao array vazio", () => {
    const snap = snapshot(SELLER)
    const nadaViaja = {
      ...snap,
      lines: snap.lines.map((l) => ({ ...l, travels: false })),
    }
    // `[]` no corpo do Asaas DESATIVA o split de uma cobranca existente — nao e
    // o mesmo que "nao mexer no split".
    expect(buildAsaasSplits(nadaViaja)).toBeUndefined()
  })

  it("quando a PMB vende, so o produtor viaja", () => {
    const splits = buildAsaasSplits(snapshot(null))
    expect(splits).toHaveLength(1)
    expect(splits?.[0].walletId).toBe("w_prod")
  })

  it("venda na loja do autor nao manda splits", () => {
    expect(buildAsaasSplits(snapshot(PRODUCER))).toBeUndefined()
  })

  it("devolve undefined, nunca [] — array vazio DESATIVA o split no Asaas", () => {
    expect(buildAsaasSplits(null)).toBeUndefined()
    expect(buildAsaasSplits(snapshot(PRODUCER))).not.toEqual([])
  })

  it("usa percentual (nunca estoura o liquido da cobranca)", () => {
    const splits = buildAsaasSplits(snapshot(SELLER))
    for (const s of splits ?? []) {
      expect(s.percentualValue).toBeGreaterThan(0)
      expect(s).not.toHaveProperty("fixedValue")
    }
  })
})

describe("quando a venda exige rateio", () => {
  const authored = { authorTenantId: PRODUCER }

  it("curso do catalogo da PMB nunca exige", () => {
    expect(saleRequiresSplit({ authorTenantId: null }, SELLER)).toBe(false)
    expect(saleRequiresSplit({ authorTenantId: null }, null)).toBe(false)
  })

  it("autor vendendo na propria loja nao exige", () => {
    expect(saleRequiresSplit(authored, PRODUCER)).toBe(false)
  })

  it("outra unidade e a vitrine PMB exigem", () => {
    expect(saleRequiresSplit(authored, SELLER)).toBe(true)
    expect(saleRequiresSplit(authored, null)).toBe(true)
  })

  it("isAuthoredCourse separa catalogo da PMB de curso de unidade", () => {
    expect(isAuthoredCourse({ authorTenantId: null })).toBe(false)
    expect(isAuthoredCourse(authored)).toBe(true)
  })
})

describe("leitura do snapshot congelado", () => {
  it("le um snapshot valido", () => {
    const snap = snapshot(SELLER)
    const parsed = parseSplitSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(parsed?.producerTenantId).toBe(PRODUCER)
    expect(parsed?.lines).toHaveLength(3)
  })

  it("matricula antiga (sem snapshot) devolve null, nao explode", () => {
    expect(parseSplitSnapshot(null)).toBeNull()
  })

  it("linha corrompida devolve null em vez de derrubar o fulfill", () => {
    // O aluno ja pagou: prender o acesso dele por causa do extrato seria o
    // trade errado.
    expect(parseSplitSnapshot({ version: 99 } as never)).toBeNull()
    expect(parseSplitSnapshot({ version: 1 } as never)).toBeNull()
    expect(parseSplitSnapshot([] as never)).toBeNull()
    expect(parseSplitSnapshot({ version: 1, lines: [] } as never)).toBeNull()
    // Sem `lines` mas COM produtor: so a checagem do array pega este caso.
    expect(
      parseSplitSnapshot({ version: 1, producerTenantId: "t1" } as never),
    ).toBeNull()
    // Com `lines` mas sem produtor: so a checagem do produtor pega este.
    expect(parseSplitSnapshot({ version: 1, lines: [] } as never)).toBeNull()
  })
})
