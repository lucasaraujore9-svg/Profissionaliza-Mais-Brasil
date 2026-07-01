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

  it("todos os papéis veem exportacoes e visao-geral", () => {
    for (const role of [
      "SUPER_ADMIN",
      "PMB_FINANCEIRO",
      "PMB_SALES",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_RESELLER_MGR",
    ] as const) {
      expect(canViewTab(role, "visao-geral")).toBe(true)
      expect(canViewTab(role, "exportacoes")).toBe(true)
    }
  })

  it("aba inexistente não é vista por ninguém", () => {
    expect(reportTab("inexistente")).toBeUndefined()
    expect(canViewTab("SUPER_ADMIN", "inexistente")).toBe(false)
  })
})
