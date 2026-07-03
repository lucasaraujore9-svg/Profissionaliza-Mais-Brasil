import { describe, it, expect } from "vitest"
import {
  monthlyActive,
  monthlyAllowedOn,
  effectivePaymentType,
  type MonthlyPolicy,
} from "./monthly-policy"

// QA-008: política pura de parcelado/mensalidade por unidade. Dois níveis
// (admin libera + revendedor ativa) + escopo por canal (vitrine vs direct).

function policy(over: Partial<MonthlyPolicy> = {}): MonthlyPolicy {
  return {
    monthlyAllowed: true,
    monthlyEnabled: true,
    monthlyScope: "DIRECT_AND_VITRINE",
    ...over,
  }
}

describe("monthlyActive", () => {
  it("true só quando admin liberou E revendedor ativou", () => {
    expect(monthlyActive(policy())).toBe(true)
    expect(monthlyActive(policy({ monthlyAllowed: false }))).toBe(false)
    expect(monthlyActive(policy({ monthlyEnabled: false }))).toBe(false)
  })
})

describe("monthlyAllowedOn", () => {
  it("inativo → false em qualquer canal", () => {
    const p = policy({ monthlyEnabled: false })
    expect(monthlyAllowedOn(p, "direct")).toBe(false)
    expect(monthlyAllowedOn(p, "vitrine")).toBe(false)
  })
  it("ativo + DIRECT_ONLY → só no canal direct", () => {
    const p = policy({ monthlyScope: "DIRECT_ONLY" })
    expect(monthlyAllowedOn(p, "direct")).toBe(true)
    expect(monthlyAllowedOn(p, "vitrine")).toBe(false)
  })
  it("ativo + DIRECT_AND_VITRINE → nos dois canais", () => {
    const p = policy({ monthlyScope: "DIRECT_AND_VITRINE" })
    expect(monthlyAllowedOn(p, "direct")).toBe(true)
    expect(monthlyAllowedOn(p, "vitrine")).toBe(true)
  })
})

describe("effectivePaymentType", () => {
  it("ONE_TIME sempre permanece ONE_TIME", () => {
    expect(effectivePaymentType("ONE_TIME", policy(), "vitrine")).toBe("ONE_TIME")
    expect(effectivePaymentType("ONE_TIME", policy({ monthlyEnabled: false }), "direct")).toBe("ONE_TIME")
  })
  it("MONTHLY honrado quando o canal permite", () => {
    expect(effectivePaymentType("MONTHLY", policy(), "vitrine")).toBe("MONTHLY")
    expect(effectivePaymentType("MONTHLY", policy({ monthlyScope: "DIRECT_ONLY" }), "direct")).toBe("MONTHLY")
  })
  it("MONTHLY cai para ONE_TIME quando o canal não permite", () => {
    // DIRECT_ONLY na vitrine → cai.
    expect(effectivePaymentType("MONTHLY", policy({ monthlyScope: "DIRECT_ONLY" }), "vitrine")).toBe("ONE_TIME")
    // Parcelado inativo → cai em qualquer canal.
    expect(effectivePaymentType("MONTHLY", policy({ monthlyAllowed: false }), "direct")).toBe("ONE_TIME")
  })
})
