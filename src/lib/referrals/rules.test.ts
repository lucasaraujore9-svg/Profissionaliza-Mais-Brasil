import { describe, it, expect } from "vitest"
import {
  monthsInProgram,
  parseBrackets,
  parsePlan,
  parsePlanSettings,
  serializePlanSettings,
  resolveBracket,
  resolvePhase,
  sortBrackets,
  DEFAULT_PLAN_SETTINGS,
  type CommissionPhase,
} from "./rules"

const d = (s: string) => new Date(s)

describe("parseBrackets", () => {
  it("descarta entradas invalidas e ordena com a faixa sem teto por ultimo", () => {
    expect(
      parseBrackets([
        { upTo: null, value: 200 },
        { upTo: 10, value: 100 },
        { upTo: 0, value: 50 }, // upTo < 1 → descartado
        { upTo: 5, value: -1 }, // valor negativo → descartado
        { upTo: 5, value: "abc" }, // NaN → descartado
        "lixo",
        null,
      ]),
    ).toEqual([
      { upTo: 10, value: 100 },
      { upTo: null, value: 200 },
    ])
  })

  it("trata upTo ausente/vazio como faixa final (null)", () => {
    expect(parseBrackets([{ value: 30 }, { upTo: "", value: 40 }])).toEqual([
      { upTo: null, value: 30 },
      { upTo: null, value: 40 },
    ])
  })

  it("aceita valor 0 (faixa que nao paga) e aplica floor no upTo", () => {
    expect(parseBrackets([{ upTo: 10.9, value: 0 }])).toEqual([
      { upTo: 10, value: 0 },
    ])
  })

  it("retorna [] p/ nao-array, vazio ou tudo invalido", () => {
    expect(parseBrackets(null)).toEqual([])
    expect(parseBrackets("x")).toEqual([])
    expect(parseBrackets([])).toEqual([])
    expect(parseBrackets([{ value: -5 }])).toEqual([])
  })
})

describe("sortBrackets", () => {
  it("ordena por upTo crescente com a faixa 'sem teto' (null) por ultimo", () => {
    expect(
      sortBrackets([
        { upTo: null, value: 1 },
        { upTo: 30, value: 2 },
        { upTo: 10, value: 3 },
      ]),
    ).toEqual([
      { upTo: 10, value: 3 },
      { upTo: 30, value: 2 },
      { upTo: null, value: 1 },
    ])
  })
})

describe("resolveBracket", () => {
  const brackets = [
    { upTo: 10, value: 100 },
    { upTo: 30, value: 150 },
    { upTo: null, value: 200 },
  ]

  it("null quando nao ha faixas", () => {
    expect(resolveBracket([], 5)).toBeNull()
  })

  it("escolhe a 1a faixa cujo teto cobre a contagem (borda inclusive)", () => {
    expect(resolveBracket(brackets, 0)).toEqual({ index: 0, value: 100 })
    expect(resolveBracket(brackets, 10)).toEqual({ index: 0, value: 100 })
    expect(resolveBracket(brackets, 11)).toEqual({ index: 1, value: 150 })
    expect(resolveBracket(brackets, 30)).toEqual({ index: 1, value: 150 })
    expect(resolveBracket(brackets, 31)).toEqual({ index: 2, value: 200 })
  })

  it("ordena antes de escolher (entrada fora de ordem)", () => {
    expect(resolveBracket([...brackets].reverse(), 11)).toEqual({
      index: 1,
      value: 150,
    })
  })

  it("contagem acima de todas as faixas finitas: mantem a ultima", () => {
    // Sem faixa "sem teto", quem passa do ultimo teto continua na ultima faixa
    // conhecida (nunca fica sem comissao).
    expect(
      resolveBracket(
        [
          { upTo: 5, value: 50 },
          { upTo: 10, value: 80 },
        ],
        999,
      ),
    ).toEqual({ index: 1, value: 80 })
  })
})

describe("parsePlan", () => {
  const fase = (over: Record<string, unknown> = {}) => ({
    durationMonths: 3,
    rateType: "PERCENT",
    bracketBasis: "ACTIVE_UNITS",
    payoutBase: "REFERRED_THIS_MONTH",
    brackets: [{ upTo: null, value: 20 }],
    ...over,
  })

  it("aceita array cru e o objeto { phases: [...] }", () => {
    expect(parsePlan([fase()])).toHaveLength(1)
    expect(parsePlan({ phases: [fase()] })).toEqual(parsePlan([fase()]))
  })

  it("retorna [] p/ valor que nao e plano", () => {
    expect(parsePlan(null)).toEqual([])
    expect(parsePlan("x")).toEqual([])
    expect(parsePlan({})).toEqual([])
    expect(parsePlan([])).toEqual([])
  })

  it("preserva os campos validos da fase", () => {
    expect(parsePlan([fase()])).toEqual([
      {
        durationMonths: 3,
        rateType: "PERCENT",
        bracketBasis: "ACTIVE_UNITS",
        payoutBase: "REFERRED_THIS_MONTH",
        brackets: [{ upTo: null, value: 20 }],
      },
    ])
  })

  it("descarta fase sem faixas validas (nao pagaria nada)", () => {
    expect(parsePlan([fase({ brackets: [] })])).toEqual([])
    expect(parsePlan([fase({ brackets: [{ value: -1 }] })])).toEqual([])
    expect(parsePlan([fase({ brackets: "x" })])).toEqual([])
    // a fase valida ao lado sobrevive
    expect(parsePlan([fase({ brackets: [] }), fase()])).toHaveLength(1)
  })

  it("enum fora do dominio cai no default de cada campo", () => {
    expect(
      parsePlan([
        fase({ rateType: "XPTO", bracketBasis: "XPTO", payoutBase: "XPTO" }),
      ])[0],
    ).toMatchObject({
      rateType: "FIXED",
      bracketBasis: "NEW_REFERRALS_MONTH",
      payoutBase: "ALL_ACTIVE",
    })
  })

  it("durationMonths < 1 ou NaN descarta a fase; fracionario sofre floor", () => {
    expect(parsePlan([fase({ durationMonths: 0 })])).toEqual([])
    expect(parsePlan([fase({ durationMonths: "abc" })])).toEqual([])
    expect(parsePlan([fase({ durationMonths: 3.9 })])[0].durationMonths).toBe(3)
  })

  it("fase intermediaria 'em diante' vira a final e trunca o resto", () => {
    // So a ULTIMA fase pode ser aberta; um plano malformado e cortado ali.
    const plan = parsePlan([
      fase({ durationMonths: 3 }),
      fase({ durationMonths: null }),
      fase({ durationMonths: 6 }),
    ])

    expect(plan.map((p) => p.durationMonths)).toEqual([3, null])
  })
})

describe("resolvePhase", () => {
  const phases: CommissionPhase[] = [
    {
      durationMonths: 3,
      rateType: "FIXED",
      bracketBasis: "ACTIVE_UNITS",
      payoutBase: "ALL_ACTIVE",
      brackets: [{ upTo: null, value: 100 }],
    },
    {
      durationMonths: 2,
      rateType: "PERCENT",
      bracketBasis: "ACTIVE_UNITS",
      payoutBase: "ALL_ACTIVE",
      brackets: [{ upTo: null, value: 30 }],
    },
    {
      durationMonths: null,
      rateType: "PERCENT",
      bracketBasis: "ACTIVE_UNITS",
      payoutBase: "ALL_ACTIVE",
      brackets: [{ upTo: null, value: 10 }],
    },
  ]

  it("null quando o plano esta vazio", () => {
    expect(resolvePhase([], 0)).toBeNull()
  })

  it("caminha as duracoes acumuladas (bordas de cada fase)", () => {
    expect(resolvePhase(phases, 0)?.index).toBe(0)
    expect(resolvePhase(phases, 2)?.index).toBe(0)
    expect(resolvePhase(phases, 3)?.index).toBe(1)
    expect(resolvePhase(phases, 4)?.index).toBe(1)
    expect(resolvePhase(phases, 5)?.index).toBe(2)
    expect(resolvePhase(phases, 999)?.index).toBe(2)
  })

  it("sem fase 'em diante': meses alem do plano ficam na ultima fase", () => {
    const finitas = phases.slice(0, 2)
    expect(resolvePhase(finitas, 99)).toEqual({ index: 1, phase: finitas[1] })
  })
})

describe("monthsInProgram", () => {
  it("mesmo mes de calendario = 0", () => {
    expect(
      monthsInProgram(d("2026-01-31T23:00:00Z"), d("2026-01-01T00:00:00Z")),
    ).toBe(0)
  })

  it("conta meses de calendario, nao dias", () => {
    expect(
      monthsInProgram(d("2026-01-31T00:00:00Z"), d("2026-02-01T00:00:00Z")),
    ).toBe(1)
    expect(
      monthsInProgram(d("2025-11-10T00:00:00Z"), d("2026-02-01T00:00:00Z")),
    ).toBe(3)
  })

  it("clamp em 0 quando a apuracao e anterior a entrada no programa", () => {
    expect(
      monthsInProgram(d("2026-05-01T00:00:00Z"), d("2026-01-01T00:00:00Z")),
    ).toBe(0)
  })
})

describe("parsePlanSettings / serializePlanSettings", () => {
  it("plano sem ajustes cai no padrao historico (relogio por mes, sem janela)", () => {
    expect(parsePlanSettings(null)).toEqual(DEFAULT_PLAN_SETTINGS)
    expect(parsePlanSettings([{ durationMonths: null }])).toEqual(DEFAULT_PLAN_SETTINGS)
    expect(parsePlanSettings({ phases: [] })).toEqual(DEFAULT_PLAN_SETTINGS)
  })

  it("le relogio e janela, e faz round-trip pela serializacao", () => {
    const plano = {
      clock: "paidInvoices",
      promoPaidUntil: "2026-12-15T23:59:59.999-03:00",
      phases: [],
    }
    const lido = parsePlanSettings(plano)
    expect(lido.clock).toBe("paidInvoices")
    // Fim do dia 15/12 em Brasilia = 16/12 02:59:59.999Z.
    expect(lido.promoPaidUntil?.toISOString()).toBe("2026-12-16T02:59:59.999Z")

    expect(parsePlanSettings({ ...serializePlanSettings(lido), phases: [] })).toEqual(lido)
  })

  it("relogio invalido e data impossivel nao derrubam ninguem para a fase final", () => {
    const s = parsePlanSettings({ clock: "bananas", promoPaidUntil: "nao-e-data" })
    expect(s.clock).toBe("months")
    expect(s.promoPaidUntil).toBeNull()
  })

  it("serializePlanSettings omite o que esta no padrao", () => {
    expect(serializePlanSettings(DEFAULT_PLAN_SETTINGS)).toEqual({})
  })
})
