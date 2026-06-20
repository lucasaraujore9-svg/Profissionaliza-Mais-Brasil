import { describe, it, expect } from "vitest"
import {
  canViewFinance,
  canViewFullFinance,
  canMarkPaid,
  canManageCommissions,
} from "./roles"

describe("auth/roles — AuthZ financeira (QA-008)", () => {
  it("canViewFinance libera SUPER_ADMIN/PMB_FINANCEIRO/PMB_SALES/PMB_RESELLER_MGR", () => {
    for (const r of ["SUPER_ADMIN", "PMB_FINANCEIRO", "PMB_SALES", "PMB_RESELLER_MGR"] as const) {
      expect(canViewFinance(r)).toBe(true)
    }
    for (const r of ["RESELLER", "PMB_SALES_MGR", "PMB_REVENDA_SALES"] as const) {
      expect(canViewFinance(r)).toBe(false)
    }
    expect(canViewFinance(null)).toBe(false)
    expect(canViewFinance(undefined)).toBe(false)
  })

  it("canViewFullFinance/canMarkPaid/canManageCommissions: só SUPER_ADMIN e PMB_FINANCEIRO", () => {
    for (const fn of [canViewFullFinance, canMarkPaid, canManageCommissions]) {
      expect(fn("SUPER_ADMIN")).toBe(true)
      expect(fn("PMB_FINANCEIRO")).toBe(true)
      expect(fn("PMB_SALES")).toBe(false)
      expect(fn("PMB_RESELLER_MGR")).toBe(false)
      expect(fn("RESELLER")).toBe(false)
      expect(fn(null)).toBe(false)
      expect(fn(undefined)).toBe(false)
    }
  })
})
