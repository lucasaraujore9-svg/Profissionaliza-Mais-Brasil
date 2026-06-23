import { describe, it, expect } from "vitest"
import {
  RESELLER_PLANS,
  RESELLER_PLAN_VALUES,
  isAllowedResellerPlan,
  planEnablesAutomation,
} from "./plans"

describe("planos de sub-revenda", () => {
  it("oferece exatamente os planos 209 e 239", () => {
    expect(RESELLER_PLAN_VALUES).toEqual([209, 239])
    expect(RESELLER_PLANS.map((p) => p.label)).toEqual([
      "Profissionaliza",
      "Profissionaliza PRO",
    ])
  })

  it("só aceita 209 ou 239 (nunca grátis nem valor livre)", () => {
    expect(isAllowedResellerPlan(209)).toBe(true)
    expect(isAllowedResellerPlan(239)).toBe(true)
    expect(isAllowedResellerPlan(0)).toBe(false) // sem cortesia
    expect(isAllowedResellerPlan(100)).toBe(false)
    expect(isAllowedResellerPlan(250)).toBe(false)
  })

  it("PRO (239) habilita Automação; base (209) não", () => {
    expect(planEnablesAutomation(239)).toBe(true)
    expect(planEnablesAutomation(209)).toBe(false)
    expect(planEnablesAutomation(0)).toBe(false)
  })
})
