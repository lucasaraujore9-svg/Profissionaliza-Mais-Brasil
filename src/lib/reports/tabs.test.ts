import { describe, it, expect } from "vitest"
import {
  ADMIN_ROLE_PRESETS,
  PMB_TEAM_ROLES,
  resolveAdminPermissions,
  type PmbTeamRole,
} from "@/lib/auth/admin-permissions"
import { allowedTabs, canViewTab, defaultTab, reportTab } from "./tabs"

/** As abas passaram a ser gateadas por permissão; o papel entra via preset. */
const perms = (role: PmbTeamRole) => resolveAdminPermissions(role)

describe("admin report tabs — gating", () => {
  it("SUPER_ADMIN vê todas as abas", () => {
    const tabs = allowedTabs(perms("SUPER_ADMIN"))
    expect(tabs.map((t) => t.slug)).toContain("financeiro")
    expect(tabs.map((t) => t.slug)).toContain("leads-conversao")
    expect(tabs.length).toBe(9)
  })

  it("PMB_SALES não vê financeiro nem rede", () => {
    expect(canViewTab(perms("PMB_SALES"), "financeiro")).toBe(false)
    expect(canViewTab(perms("PMB_SALES"), "rede-revendedores")).toBe(false)
    expect(canViewTab(perms("PMB_SALES"), "receita-vendas")).toBe(true)
  })

  it("PMB_FINANCEIRO vê financeiro e comissões, mas não leads", () => {
    expect(canViewTab(perms("PMB_FINANCEIRO"), "financeiro")).toBe(true)
    expect(canViewTab(perms("PMB_FINANCEIRO"), "indicacoes-comissoes")).toBe(true)
    expect(canViewTab(perms("PMB_FINANCEIRO"), "leads-conversao")).toBe(false)
  })

  it("PMB_REVENDA_SALES vê rede/leads mas não financeiro", () => {
    expect(canViewTab(perms("PMB_REVENDA_SALES"), "rede-revendedores")).toBe(true)
    expect(canViewTab(perms("PMB_REVENDA_SALES"), "leads-conversao")).toBe(true)
    expect(canViewTab(perms("PMB_REVENDA_SALES"), "financeiro")).toBe(false)
  })

  it("defaultTab respeita defaultFor por papel", () => {
    expect(defaultTab("SUPER_ADMIN", perms("SUPER_ADMIN"))).toBe("visao-geral")
    expect(defaultTab("PMB_FINANCEIRO", perms("PMB_FINANCEIRO"))).toBe("financeiro")
    expect(defaultTab("PMB_SALES", perms("PMB_SALES"))).toBe("receita-vendas")
  })

  // A aba Exportações só aparece para quem a API de export realmente serve
  // (`REPORT_ROLES` em /api/admin/relatorios/[type]). Antes ela era oferecida a
  // todos os papéis e retornava 403 para gerente de vendas, vendedor de revenda
  // e financeiro.
  it("exportacoes só para os papéis que a API de export atende", () => {
    for (const role of ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] as const) {
      expect(canViewTab(perms(role), "exportacoes"), role).toBe(true)
    }
    for (const role of [
      "PMB_FINANCEIRO",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
    ] as const) {
      expect(canViewTab(perms(role), "exportacoes"), role).toBe(false)
    }
  })

  it("aba inexistente não é vista por ninguém", () => {
    expect(reportTab("inexistente")).toBeUndefined()
    expect(canViewTab(perms("SUPER_ADMIN"), "inexistente")).toBe(false)
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
        expect(canViewTab(perms(role), tab)).toBe(false)
      }
    }
  })

  it("visão geral (MRR + top revendas por GMV) só para SUPER_ADMIN e PMB_FINANCEIRO", () => {
    expect(canViewTab(perms("SUPER_ADMIN"), "visao-geral")).toBe(true)
    expect(canViewTab(perms("PMB_FINANCEIRO"), "visao-geral")).toBe(true)
    for (const role of [
      "PMB_SALES",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_RESELLER_MGR",
    ] as const) {
      expect(canViewTab(perms(role), "visao-geral")).toBe(false)
    }
  })

  it("PMB_SALES vê receita-vendas (escopado a PMB no módulo) mas não alunos/cursos globais", () => {
    expect(canViewTab(perms("PMB_SALES"), "receita-vendas")).toBe(true)
    expect(canViewTab(perms("PMB_SALES"), "alunos-matriculas")).toBe(false)
    expect(canViewTab(perms("PMB_SALES"), "cursos-cupons")).toBe(false)
    expect(canViewTab(perms("PMB_SALES"), "visao-geral")).toBe(false)
  })

  it("alunos/cursos globais são exclusivos de SUPER_ADMIN", () => {
    for (const tab of ["alunos-matriculas", "cursos-cupons"] as const) {
      const perm = reportTab(tab)!.permission
      const holders = PMB_TEAM_ROLES.filter((r) =>
        ADMIN_ROLE_PRESETS[r].includes(perm),
      )
      expect(holders).toEqual(["SUPER_ADMIN"])
    }
  })
})
