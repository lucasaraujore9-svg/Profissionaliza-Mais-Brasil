import { describe, it, expect } from "vitest"
import {
  parseReferralTiers,
  sortTiers,
  monthsSinceActivation,
  resolveTierPercent,
} from "./tiers"

const d = (s: string) => new Date(s)

describe("parseReferralTiers (QA-004)", () => {
  it("descarta entradas inválidas e ordena", () => {
    expect(
      parseReferralTiers([
        { untilMonth: null, percent: 20 },
        { untilMonth: 6, percent: 50 },
        { untilMonth: 0, percent: 30 }, // m < 1 → descartado
        { untilMonth: 3, percent: 150 }, // percent > 100 → descartado
        { percent: "abc" }, // NaN → descartado
        "lixo",
      ]),
    ).toEqual([
      { untilMonth: 6, percent: 50 },
      { untilMonth: null, percent: 20 },
    ])
  })
  it("retorna null p/ não-array, vazio ou tudo inválido", () => {
    expect(parseReferralTiers(null)).toBeNull()
    expect(parseReferralTiers("x")).toBeNull()
    expect(parseReferralTiers([])).toBeNull()
    expect(parseReferralTiers([{ percent: -1 }])).toBeNull()
  })
  it("aplica floor em untilMonth fracionário", () => {
    expect(parseReferralTiers([{ untilMonth: 6.9, percent: 10 }])).toEqual([
      { untilMonth: 6, percent: 10 },
    ])
  })
})

describe("sortTiers", () => {
  it("ordena crescente com o tier 'em diante' (null) por último", () => {
    expect(
      sortTiers([
        { untilMonth: null, percent: 1 },
        { untilMonth: 12, percent: 2 },
        { untilMonth: 3, percent: 3 },
      ]),
    ).toEqual([
      { untilMonth: 3, percent: 3 },
      { untilMonth: 12, percent: 2 },
      { untilMonth: null, percent: 1 },
    ])
  })
})

describe("monthsSinceActivation", () => {
  it("0 meses antes de completar o mês", () => {
    expect(monthsSinceActivation(d("2026-01-10T00:00:00Z"), d("2026-02-09T00:00:00Z"))).toBe(0)
  })
  it("1 mês ao completar o dia exato", () => {
    expect(monthsSinceActivation(d("2026-01-10T00:00:00Z"), d("2026-02-10T00:00:00Z"))).toBe(1)
  })
  it("conta corretamente na virada de ano", () => {
    expect(monthsSinceActivation(d("2025-11-15T00:00:00Z"), d("2026-02-15T00:00:00Z"))).toBe(3)
  })
  it("nunca negativo (at antes de activatedAt)", () => {
    expect(monthsSinceActivation(d("2026-05-10T00:00:00Z"), d("2026-01-01T00:00:00Z"))).toBe(0)
  })
  it("dia de ativação 31 em mês curto não conta a mais", () => {
    // ativou 31/01; 28/02 ainda não completou (28 < 31) → 0
    expect(monthsSinceActivation(d("2026-01-31T00:00:00Z"), d("2026-02-28T00:00:00Z"))).toBe(0)
  })
})

describe("resolveTierPercent (borda de faixa)", () => {
  const tiers = [
    { untilMonth: 6, percent: 50 },
    { untilMonth: null, percent: 20 },
  ]
  const act = d("2026-01-15T00:00:00Z")

  it("null quando não há escala configurada", () => {
    expect(resolveTierPercent(null, act, d("2026-03-15T00:00:00Z"))).toBeNull()
    expect(resolveTierPercent([], act, d("2026-03-15T00:00:00Z"))).toBeNull()
  })
  it("mês 1 (sem tempo decorrido) → 50%", () => {
    expect(resolveTierPercent(tiers, act, d("2026-01-20T00:00:00Z"))).toBe(50)
  })
  it("mês 6 (borda inclusive) → 50%", () => {
    expect(resolveTierPercent(tiers, act, d("2026-06-15T00:00:00Z"))).toBe(50)
  })
  it("mês 7 (passou da faixa) → 20%", () => {
    expect(resolveTierPercent(tiers, act, d("2026-07-15T00:00:00Z"))).toBe(20)
  })
  it("activatedAt null trata como mês 1", () => {
    expect(resolveTierPercent(tiers, null, d("2030-01-01T00:00:00Z"))).toBe(50)
  })
  it("sem tier 'em diante': mantém o último percentual conhecido", () => {
    expect(resolveTierPercent([{ untilMonth: 3, percent: 40 }], act, d("2027-01-15T00:00:00Z"))).toBe(40)
  })
})
