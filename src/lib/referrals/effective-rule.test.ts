import { describe, it, expect } from "vitest"
import {
  FALLBACK_MIN_REFERRALS,
  FALLBACK_PERCENT,
  describeEffectiveCommission,
  percentToPhases,
  resolveEffectiveCommission,
  type EffectiveCommission,
  type GlobalCommissionInput,
  type ReferrerCommissionInput,
} from "./effective-rule"
import { DEFAULT_PLAN_SETTINGS, type CommissionPhase } from "./rules"

// Estado global "de fabrica": nenhum plano, nenhuma faixa, so o percentual
// padrao. E o ponto de partida de quase todos os casos abaixo.
function makeGlobal(
  over: Partial<GlobalCommissionInput> = {},
): GlobalCommissionInput {
  return {
    commissionMode: "MONTHLY_TIERED",
    commissionBracketBasis: "ACTIVE_UNITS",
    commissionRateType: "PERCENT",
    commissionPayoutBase: "ALL_ACTIVE",
    commissionBrackets: null,
    commissionPlan: null,
    defaultReferralPercent: 10,
    defaultReferralMinReferrals: null,
    ...over,
  }
}

/** Indicador sem nada configurado — cada caso liga so o que quer testar. */
function makeReferrer(
  over: Partial<ReferrerCommissionInput> = {},
): ReferrerCommissionInput {
  return {
    commissionBracketBasis: null,
    commissionRateType: null,
    commissionPayoutBase: null,
    commissionBrackets: null,
    commissionPlan: null,
    referralMinReferrals: null,
    ...over,
  }
}

/** Plano multi-fase valido, parametrizavel pelo valor da 1a faixa. */
function planWith(value: number): unknown {
  return [
    {
      durationMonths: 6,
      rateType: "PERCENT",
      bracketBasis: "ACTIVE_UNITS",
      payoutBase: "ALL_ACTIVE",
      brackets: [{ upTo: null, value }],
    },
    {
      durationMonths: null,
      rateType: "PERCENT",
      bracketBasis: "ACTIVE_UNITS",
      payoutBase: "ALL_ACTIVE",
      brackets: [{ upTo: null, value: 5 }],
    },
  ]
}

describe("resolveEffectiveCommission — regressao do bug de origem", () => {
  // BUG: a regra do INDICADOR (bloco commission*) era gravada na tela dele, mas
  // o calculo lia `referralPercent` do INDICADO — resultado: quem configurava
  // 50% via o sistema pagar o percentual padrao global (10%). O caso abaixo
  // trava exatamente isso: a faixa propria do indicador tem que vencer o padrao.
  it("indicador com faixa propria de 50% PERCENT recebe 50%, nao o padrao global de 10%", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({
        commissionRateType: "PERCENT",
        commissionBrackets: [{ upTo: null, value: 50 }],
      }),
      makeGlobal({
        defaultReferralPercent: 10,
        // Estado real de producao: faixa global zerada (ver caso degenerado).
        commissionBrackets: [{ upTo: 10, value: 0 }],
      }),
    )

    expect(rule.source).toBe("tenant.brackets")
    expect(rule.phases).toHaveLength(1)
    expect(rule.phases[0].rateType).toBe("PERCENT")
    expect(rule.phases[0].brackets).toEqual([{ upTo: null, value: 50 }])
  })
})

describe("resolveEffectiveCommission — precedencia", () => {
  it("plano da unidade vence tudo (inclusive as faixas da propria unidade)", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({
        commissionPlan: planWith(30),
        commissionBrackets: [{ upTo: null, value: 50 }],
      }),
      makeGlobal({ commissionPlan: planWith(1) }),
    )

    expect(rule.source).toBe("tenant.plan")
    expect(rule.phases).toHaveLength(2)
    expect(rule.phases[0].brackets[0].value).toBe(30)
    expect(rule.warnings).toEqual([])
  })

  it("faixas da unidade vencem o plano global", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({
        commissionRateType: "FIXED",
        commissionBrackets: [{ upTo: null, value: 40 }],
      }),
      makeGlobal({ commissionPlan: planWith(1) }),
    )

    expect(rule.source).toBe("tenant.brackets")
    expect(rule.phases[0].rateType).toBe("FIXED")
    expect(rule.phases[0].brackets[0].value).toBe(40)
  })

  it("plano global vence as faixas globais quando a unidade nao tem nada", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer(),
      makeGlobal({
        commissionPlan: planWith(20),
        commissionBrackets: [{ upTo: null, value: 3 }],
      }),
    )

    expect(rule.source).toBe("global.plan")
    expect(rule.phases[0].brackets[0].value).toBe(20)
  })

  it("faixas globais valem quando nao ha plano nenhum", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer(),
      makeGlobal({
        commissionRateType: "FIXED",
        commissionBracketBasis: "NEW_REFERRALS_MONTH",
        commissionPayoutBase: "REFERRED_THIS_MONTH",
        commissionBrackets: [
          { upTo: 10, value: 100 },
          { upTo: null, value: 200 },
        ],
      }),
    )

    expect(rule.source).toBe("global.brackets")
    expect(rule.phases).toHaveLength(1)
    expect(rule.phases[0]).toMatchObject({
      durationMonths: null,
      rateType: "FIXED",
      bracketBasis: "NEW_REFERRALS_MONTH",
      payoutBase: "REFERRED_THIS_MONTH",
    })
    expect(rule.phases[0].brackets).toEqual([
      { upTo: 10, value: 100 },
      { upTo: null, value: 200 },
    ])
  })

  it("cai no percentual padrao global quando nada esta configurado", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer(),
      makeGlobal({ defaultReferralPercent: 25 }),
    )

    expect(rule.source).toBe("fallback.percent")
    expect(rule.phases[0].brackets[0].value).toBe(25)
  })
})

describe("resolveEffectiveCommission — nunca devolve fases vazias", () => {
  it("sem nada configurado: fase unica PERCENT com o percentual padrao", () => {
    const rule = resolveEffectiveCommission(null, makeGlobal())

    expect(rule.phases).toEqual(percentToPhases(10))
    expect(rule.phases[0].rateType).toBe("PERCENT")
    expect(rule.phases[0].durationMonths).toBeNull()
  })

  it("sem percentual padrao: usa o FALLBACK_PERCENT do modulo", () => {
    for (const value of [null, undefined, 0, "abc"]) {
      const rule = resolveEffectiveCommission(
        null,
        makeGlobal({ defaultReferralPercent: value }),
      )
      expect(rule.source).toBe("fallback.percent")
      expect(rule.phases[0].brackets[0].value).toBe(FALLBACK_PERCENT)
    }
  })
})

describe("resolveEffectiveCommission — faixas globais degeneradas", () => {
  // Alcapao real de producao: a regra global existia mas com todas as faixas em
  // 0 — o motor "achava" a regra, aplicava 0% e pagava R$ 0 sem erro nenhum.
  it("faixas globais todas zeradas contam como nao configuradas e avisam", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer(),
      makeGlobal({
        commissionBrackets: [{ upTo: 10, value: 0 }],
        defaultReferralPercent: 10,
      }),
    )

    expect(rule.source).toBe("fallback.percent")
    expect(rule.phases[0].brackets[0].value).toBe(10)
    expect(rule.warnings).toHaveLength(1)
    expect(rule.warnings[0]).toContain("zeradas")
  })

  it("basta uma faixa global com valor > 0 para a regra global valer", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer(),
      makeGlobal({
        commissionBrackets: [
          { upTo: 10, value: 0 },
          { upTo: null, value: 150 },
        ],
      }),
    )

    expect(rule.source).toBe("global.brackets")
    expect(rule.warnings).toEqual([])
  })
})

describe("resolveEffectiveCommission — override invalido", () => {
  it("plano da unidade malformado avisa e cai na regra global", () => {
    const rule = resolveEffectiveCommission(
      // Fase sem nenhuma faixa valida: parsePlan descarta e o plano fica vazio.
      makeReferrer({ commissionPlan: [{ durationMonths: 3, brackets: [] }] }),
      makeGlobal({ commissionBrackets: [{ upTo: null, value: 7 }] }),
    )

    expect(rule.source).toBe("global.brackets")
    expect(rule.warnings).toHaveLength(1)
    expect(rule.warnings[0]).toContain("plano de fases")
  })

  it("faixas da unidade malformadas avisam e caem na regra global", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({ commissionBrackets: [{ upTo: 5, value: -1 }, "lixo"] }),
      makeGlobal({ commissionBrackets: [{ upTo: null, value: 7 }] }),
    )

    expect(rule.source).toBe("global.brackets")
    expect(rule.warnings).toHaveLength(1)
    expect(rule.warnings[0]).toContain("faixas proprias")
  })

  it("plano e faixas invalidos ao mesmo tempo acumulam os dois avisos", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({
        commissionPlan: [{ durationMonths: 3, brackets: [] }],
        commissionBrackets: [{ value: "abc" }],
      }),
      makeGlobal({ defaultReferralPercent: 12 }),
    )

    expect(rule.source).toBe("fallback.percent")
    expect(rule.warnings).toHaveLength(2)
  })

  it("ausencia de config (null) nao gera aviso nenhum", () => {
    const rule = resolveEffectiveCommission(makeReferrer(), makeGlobal())
    expect(rule.warnings).toEqual([])
  })
})

describe("resolveEffectiveCommission — minReferrals", () => {
  it("override da unidade vence o padrao global", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({ referralMinReferrals: 3 }),
      makeGlobal({ defaultReferralMinReferrals: 5 }),
    )
    expect(rule.minReferrals).toBe(3)
  })

  it("sem override, usa o padrao global", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer(),
      makeGlobal({ defaultReferralMinReferrals: 5 }),
    )
    expect(rule.minReferrals).toBe(5)
  })

  it("sem nada, cai no fallback que espelha o default do schema", () => {
    // Nao e 0: um fallback de "sem minimo" seria mais permissivo que o banco
    // (`defaultReferralMinReferrals @default(3)`) e faria a ausencia da linha de
    // SystemSettings soltar o portao de elegibilidade sem ninguem pedir.
    expect(
      resolveEffectiveCommission(makeReferrer(), makeGlobal()).minReferrals,
    ).toBe(FALLBACK_MIN_REFERRALS)
  })

  it("override 0 zera o portao mesmo com padrao global maior", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({ referralMinReferrals: 0 }),
      makeGlobal({ defaultReferralMinReferrals: 5 }),
    )
    expect(rule.minReferrals).toBe(0)
  })
})

describe("resolveEffectiveCommission — merge campo a campo com o global", () => {
  it("unidade com faixas proprias mas sem rateType herda o rateType global", () => {
    const rule = resolveEffectiveCommission(
      makeReferrer({
        commissionRateType: null,
        commissionBracketBasis: null,
        commissionPayoutBase: "REFERRED_THIS_MONTH",
        commissionBrackets: [{ upTo: null, value: 80 }],
      }),
      makeGlobal({
        commissionRateType: "FIXED",
        commissionBracketBasis: "NEW_REFERRALS_MONTH",
        commissionPayoutBase: "ALL_ACTIVE",
      }),
    )

    expect(rule.source).toBe("tenant.brackets")
    expect(rule.phases[0]).toMatchObject({
      rateType: "FIXED", // herdado
      bracketBasis: "NEW_REFERRALS_MONTH", // herdado
      payoutBase: "REFERRED_THIS_MONTH", // proprio
    })
  })
})

describe("percentToPhases", () => {
  it("gera uma unica fase 'em diante' PERCENT sobre todas as ativas", () => {
    expect(percentToPhases(50)).toEqual([
      {
        durationMonths: null,
        rateType: "PERCENT",
        bracketBasis: "ACTIVE_UNITS",
        payoutBase: "ALL_ACTIVE",
        brackets: [{ upTo: null, value: 50 }],
      },
    ])
  })
})

describe("describeEffectiveCommission", () => {
  function rule(
    phases: CommissionPhase[],
    over: Partial<EffectiveCommission> = {},
  ): EffectiveCommission {
    return {
      phases,
      settings: DEFAULT_PLAN_SETTINGS,
      minReferrals: 0,
      source: "fallback.percent",
      warnings: [],
      ...over,
    }
  }

  it("fase unica: frase direta com a origem", () => {
    expect(describeEffectiveCommission(rule(percentToPhases(10)))).toBe(
      "10% da mensalidade, sobre todas as indicadas ativas (origem: percentual padrao global).",
    )
  })

  it("multi-fase: descreve cada fase na ordem", () => {
    const frase = describeEffectiveCommission(
      rule(
        [
          {
            durationMonths: 1,
            rateType: "PERCENT",
            bracketBasis: "ACTIVE_UNITS",
            payoutBase: "ALL_ACTIVE",
            brackets: [{ upTo: null, value: 50 }],
          },
          {
            durationMonths: null,
            rateType: "PERCENT",
            bracketBasis: "ACTIVE_UNITS",
            payoutBase: "ALL_ACTIVE",
            brackets: [{ upTo: null, value: 15 }],
          },
        ],
        { source: "tenant.plan" },
      ),
    )

    expect(frase).toBe(
      "primeiros 1 mes de cada indicada: 50% da mensalidade, sobre todas as indicadas ativas" +
        " · depois disso: 15% da mensalidade, sobre todas as indicadas ativas" +
        " (origem: plano proprio desta unidade).",
    )
  })

  it("faixas FIXED com teto viram 'ate N / acima disso'", () => {
    const frase = describeEffectiveCommission(
      rule(
        [
          {
            durationMonths: null,
            rateType: "FIXED",
            bracketBasis: "NEW_REFERRALS_MONTH",
            payoutBase: "REFERRED_THIS_MONTH",
            brackets: [
              { upTo: 10, value: 100 },
              { upTo: null, value: 200 },
            ],
          },
        ],
        { source: "global.brackets" },
      ),
    )

    expect(frase).toBe(
      "ate 10 R$ 100,00 por unidade; acima disso R$ 200,00 por unidade," +
        " so sobre as indicadas naquele mes (origem: regra padrao global).",
    )
  })

  it("minReferrals acrescenta o portao de elegibilidade (singular e plural)", () => {
    expect(
      describeEffectiveCommission(rule(percentToPhases(10), { minReferrals: 1 })),
    ).toContain("Comeca a receber a partir de 1 indicacao ativa.")
    expect(
      describeEffectiveCommission(rule(percentToPhases(10), { minReferrals: 3 })),
    ).toContain("Comeca a receber a partir de 3 indicacoes ativas.")
  })

  it("sem minReferrals nao menciona portao nenhum", () => {
    expect(describeEffectiveCommission(rule(percentToPhases(10)))).not.toContain(
      "Comeca a receber",
    )
  })
})
