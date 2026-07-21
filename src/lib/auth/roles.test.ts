import { describe, it, expect } from "vitest"
import { UserRole } from "@prisma/client"
import {
  canViewFinance,
  canViewFullFinance,
  canMarkPaid,
  canManageCommissions,
  PMB_TEAM_ROLES,
  PMB_ROLE_LABEL,
  isPmbTeamRole,
  pmbRoleLabel,
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

describe("auth/roles — equipe PMB (/admin/equipe)", () => {
  // Guarda de regressão: papel novo no schema.prisma quebra este teste até
  // alguém decidir se ele é da equipe interna ou tem tela própria. Foi assim
  // que PMB_FINANCEIRO e PMB_DESIGNER sumiram da tela ao serem criados.
  it("PMB_TEAM_ROLES cobre todo UserRole menos RESELLER e STUDENT", () => {
    const externos = ["RESELLER", "STUDENT"]
    const esperado = Object.values(UserRole).filter((r) => !externos.includes(r)).sort()
    expect([...PMB_TEAM_ROLES].sort()).toEqual(esperado)
  })

  it("todo papel da equipe tem rótulo próprio (nunca cai no fallback)", () => {
    for (const r of PMB_TEAM_ROLES) {
      expect(PMB_ROLE_LABEL[r]).toBeTruthy()
      expect(pmbRoleLabel(r)).toBe(PMB_ROLE_LABEL[r])
    }
  })

  it("isPmbTeamRole aceita a equipe e recusa revenda/aluno e valores inválidos", () => {
    for (const r of PMB_TEAM_ROLES) expect(isPmbTeamRole(r)).toBe(true)
    for (const r of ["RESELLER", "STUDENT", "NAO_EXISTE"]) expect(isPmbTeamRole(r)).toBe(false)
    expect(isPmbTeamRole(null)).toBe(false)
    expect(isPmbTeamRole(undefined)).toBe(false)
  })

  it("pmbRoleLabel devolve o próprio valor em papel desconhecido", () => {
    expect(pmbRoleLabel("RESELLER")).toBe("RESELLER")
  })
})
