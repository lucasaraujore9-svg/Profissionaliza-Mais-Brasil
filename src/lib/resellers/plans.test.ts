import { describe, it, expect } from "vitest"
import {
  RESELLER_PLANS,
  RESELLER_PLAN_VALUES,
  isAllowedResellerPlan,
  planEnablesAutomation,
} from "./plans"

describe("planos de sub-revenda", () => {
  it("oferece só o PRO (239) — o 209 saiu de venda", () => {
    expect(RESELLER_PLAN_VALUES).toEqual([239])
    expect(RESELLER_PLANS.map((p) => p.label)).toEqual(["Profissionaliza PRO"])
  })

  it("só aceita 239 (nem 209, nem grátis, nem valor livre)", () => {
    expect(isAllowedResellerPlan(209)).toBe(false)
    expect(isAllowedResellerPlan(239)).toBe(true)
    expect(isAllowedResellerPlan(0)).toBe(false) // sem cortesia
    expect(isAllowedResellerPlan(100)).toBe(false)
    expect(isAllowedResellerPlan(250)).toBe(false)
  })

  it("PRO (239) habilita Automação", () => {
    expect(planEnablesAutomation(239)).toBe(true)
    expect(planEnablesAutomation(0)).toBe(false)
  })
})
