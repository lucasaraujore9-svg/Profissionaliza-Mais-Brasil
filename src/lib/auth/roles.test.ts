import { describe, it, expect } from "vitest"
import { UserRole } from "@prisma/client"
import {
  PMB_TEAM_ROLES,
  PMB_ROLE_LABEL,
  isPmbTeamRole,
  pmbRoleLabel,
} from "./roles"
import { resolveAdminPermissions } from "./admin-permissions"

// QA-008: a AuthZ financeira saiu daqui e virou permissão. O teste continua
// provando a MESMA fronteira, agora contra os presets.
describe("auth/roles — AuthZ financeira (QA-008)", () => {
  it("comissões a pagar: super, financeiro e gerente de unidades", () => {
    for (const r of [
      "SUPER_ADMIN",
      "PMB_FINANCEIRO",
      "PMB_RESELLER_DIRECTOR",
      "PMB_RESELLER_MGR",
    ] as const) {
      expect(resolveAdminPermissions(r).has("financeiro.view"), r).toBe(true)
    }
    for (const r of ["PMB_SALES", "PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_DESIGNER"] as const) {
      expect(resolveAdminPermissions(r).has("financeiro.view"), r).toBe(false)
    }
  })

  it("visão completa, baixa de pagamento e % por unidade: só super e financeiro", () => {
    for (const perm of [
      "financeiro.viewAll",
      "financeiro.manage",
      // O irmão por unidade do antigo `canManageCommissions`. A regra GLOBAL do
      // motor (`indicacoes.config`) era e continua SUPER_ADMIN-only.
      "indicacoes.percentUnidade",
    ] as const) {
      expect(resolveAdminPermissions("SUPER_ADMIN").has(perm), perm).toBe(true)
      expect(resolveAdminPermissions("PMB_FINANCEIRO").has(perm), perm).toBe(true)
      for (const r of [
        "PMB_SALES",
        "PMB_RESELLER_DIRECTOR",
        "PMB_RESELLER_MGR",
        "PMB_SALES_MGR",
        "PMB_REVENDA_SALES",
        "PMB_DESIGNER",
      ] as const) {
        expect(resolveAdminPermissions(r).has(perm), `${r} → ${perm}`).toBe(false)
      }
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
