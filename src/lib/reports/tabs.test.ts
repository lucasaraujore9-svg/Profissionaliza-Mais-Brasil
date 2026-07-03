import { describe, it, expect } from "vitest"
import { allowedTabs, canViewTab, defaultTab, reportTab } from "./tabs"

describe("admin report tabs — gating", () => {
  it("SUPER_ADMIN vê todas as abas", () => {
    const tabs = allowedTabs("SUPER_ADMIN")
    expect(tabs.map((t) => t.slug)).toContain("financeiro")
    expect(tabs.map((t) => t.slug)).toContain("leads-conversao")
    expect(tabs.length).toBe(9)
  })

  it("PMB_SALES não vê financeiro nem rede", () => {
    expect(canViewTab("PMB_SALES", "financeiro")).toBe(false)
    expect(canViewTab("PMB_SALES", "rede-revendedores")).toBe(false)
    expect(canViewTab("PMB_SALES", "receita-vendas")).toBe(true)
  })

  it("PMB_FINANCEIRO vê financeiro e comissões, mas não leads", () => {
    expect(canViewTab("PMB_FINANCEIRO", "financeiro")).toBe(true)
    expect(canViewTab("PMB_FINANCEIRO", "indicacoes-comissoes")).toBe(true)
    expect(canViewTab("PMB_FINANCEIRO", "leads-conversao")).toBe(false)
  })

  it("PMB_REVENDA_SALES vê rede/leads mas não financeiro", () => {
    expect(canViewTab("PMB_REVENDA_SALES", "rede-revendedores")).toBe(true)
    expect(canViewTab("PMB_REVENDA_SALES", "leads-conversao")).toBe(true)
    expect(canViewTab("PMB_REVENDA_SALES", "financeiro")).toBe(false)
  })

  it("defaultTab respeita defaultFor por papel", () => {
    expect(defaultTab("SUPER_ADMIN")).toBe("visao-geral")
    expect(defaultTab("PMB_FINANCEIRO")).toBe("financeiro")
    expect(defaultTab("PMB_SALES")).toBe("receita-vendas")
  })

  it("todos os papéis veem exportacoes", () => {
    for (const role of [
      "SUPER_ADMIN",
      "PMB_FINANCEIRO",
      "PMB_SALES",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_RESELLER_MGR",
    ] as const) {
      expect(canViewTab(role, "exportacoes")).toBe(true)
    }
  })

  it("aba inexistente não é vista por ninguém", () => {
    expect(reportTab("inexistente")).toBeUndefined()
    expect(canViewTab("SUPER_ADMIN", "inexistente")).toBe(false)
  })
})

// SEG-009: as abas de BI de agregação global não podem vazar dados de todo o
// ecossistema (receita/MRR de todas as revendas, top revendas por GMV, base de
// alunos/cursos/cupons global) para papéis de escopo limitado que passam por
// requireAdminSession. Espelha o least-privilege já aplicado no export CSV.
describe("admin report tabs — SEG-009 authz de agregação global", () => {
  const GLOBAL_TABS = [
    "visao-geral",
    "receita-vendas",
    "alunos-matriculas",
    "cursos-cupons",
  ] as const

  // Papéis de escopo limitado (tenants atribuídos / vendas próprias): nunca
  // enxergam agregados de todo o ecossistema.
  const SCOPED_ROLES = [
    "PMB_SALES_MGR",
    "PMB_REVENDA_SALES",
    "PMB_RESELLER_MGR",
  ] as const

  it("papéis de escopo limitado (mgr/revenda/reseller-mgr) não alcançam nenhuma aba de agregação global", () => {
    for (const role of SCOPED_ROLES) {
      for (const tab of GLOBAL_TABS) {
        expect(canViewTab(role, tab)).toBe(false)
      }
    }
  })

  it("visão geral (MRR + top revendas por GMV) só para SUPER_ADMIN e PMB_FINANCEIRO", () => {
    expect(canViewTab("SUPER_ADMIN", "visao-geral")).toBe(true)
    expect(canViewTab("PMB_FINANCEIRO", "visao-geral")).toBe(true)
    for (const role of [
      "PMB_SALES",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_RESELLER_MGR",
    ] as const) {
      expect(canViewTab(role, "visao-geral")).toBe(false)
    }
  })

  it("PMB_SALES vê receita-vendas (escopado a PMB no módulo) mas não alunos/cursos globais", () => {
    expect(canViewTab("PMB_SALES", "receita-vendas")).toBe(true)
    expect(canViewTab("PMB_SALES", "alunos-matriculas")).toBe(false)
    expect(canViewTab("PMB_SALES", "cursos-cupons")).toBe(false)
    expect(canViewTab("PMB_SALES", "visao-geral")).toBe(false)
  })

  it("alunos/cursos globais são exclusivos de SUPER_ADMIN", () => {
    for (const tab of ["alunos-matriculas", "cursos-cupons"] as const) {
      expect(reportTab(tab)?.roles).toEqual(["SUPER_ADMIN"])
    }
  })
})
