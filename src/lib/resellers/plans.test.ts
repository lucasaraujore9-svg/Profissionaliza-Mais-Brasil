import { describe, it, expect } from "vitest"
import {
  RESELLER_PLANS,
  RESELLER_PLAN_VALUES,
  isAllowedResellerPlan,
  planEnablesAutomation,
  recurringMonthlyValue,
} from "./plans"

describe("planos de sub-revenda", () => {
  it("oferece só o PRO: 329 mês a mês, 289 no débito automático", () => {
    expect(RESELLER_PLAN_VALUES).toEqual([329])
    expect(RESELLER_PLANS.map((p) => p.label)).toEqual(["Profissionaliza PRO"])
    expect(RESELLER_PLANS[0].recurringValue).toBe(289)
  })

  it("só aceita 329 (nem 239/209 antigos, nem grátis, nem o 289 direto)", () => {
    expect(isAllowedResellerPlan(329)).toBe(true)
    expect(isAllowedResellerPlan(239)).toBe(false)
    expect(isAllowedResellerPlan(209)).toBe(false)
    expect(isAllowedResellerPlan(289)).toBe(false) // 289 só vem pelo cartão recorrente
    expect(isAllowedResellerPlan(0)).toBe(false)
  })

  it("PRO habilita Automação", () => {
    expect(planEnablesAutomation(329)).toBe(true)
    expect(planEnablesAutomation(0)).toBe(false)
  })
})

describe("recurringMonthlyValue", () => {
  it("unidade na tabela nova ganha 289 no débito automático", () => {
    expect(recurringMonthlyValue({ planValue: 329, hasPromo: false })).toBe(289)
  })

  it("unidade antiga (239/209) não troca — ficaria mais cara", () => {
    expect(recurringMonthlyValue({ planValue: 239, hasPromo: false })).toBeNull()
    expect(recurringMonthlyValue({ planValue: 209, hasPromo: false })).toBeNull()
  })

  it("já no débito automático (289), valor livre ou promo: não oferece", () => {
    expect(recurringMonthlyValue({ planValue: 289, hasPromo: false })).toBeNull()
    expect(recurringMonthlyValue({ planValue: 150, hasPromo: false })).toBeNull()
    expect(recurringMonthlyValue({ planValue: 329, hasPromo: true })).toBeNull()
  })
})
