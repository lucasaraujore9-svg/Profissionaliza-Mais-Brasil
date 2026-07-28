import { describe, it, expect } from "vitest"
import {
  resolvePermissions,
  type PainelMemberRole,
  type PainelPermission,
} from "@/lib/auth/painel-permissions"
import { allowedPainelTabs, canViewPainelTab, PAINEL_TABS } from "./tabs"

/** `can` do papel, no mesmo formato que o guard entrega em `PainelContext.can`. */
function canFor(role: PainelMemberRole) {
  const perms = resolvePermissions(role)
  return (perm: PainelPermission) => perms.has(perm)
}

describe("painel report tabs — gating por permissão", () => {
  it("dono vê todas as abas", () => {
    const slugs = allowedPainelTabs(canFor("owner")).map((t) => t.slug)
    expect(slugs).toEqual(PAINEL_TABS.map((t) => t.slug))
  })

  it("só o dono vê Indicações & rede", () => {
    expect(canViewPainelTab("indicacoes", canFor("owner"))).toBe(true)
    for (const role of ["manager", "consultant", "support", "finance"] as const) {
      expect(canViewPainelTab("indicacoes", canFor(role))).toBe(false)
    }
  })

  it("vendedor e secretaria não têm o hub de relatórios", () => {
    for (const role of ["consultant", "support"] as const) {
      expect(allowedPainelTabs(canFor(role))).toHaveLength(0)
    }
  })

  it("gerente e financeiro veem as operacionais + financeiro, sem indicações", () => {
    for (const role of ["manager", "finance"] as const) {
      const slugs = allowedPainelTabs(canFor(role)).map((t) => t.slug)
      expect(slugs).toContain("visao-geral")
      expect(slugs).toContain("receita")
      expect(slugs).toContain("financeiro")
      expect(slugs).not.toContain("indicacoes")
    }
  })

  it("aba inexistente é negada mesmo para o dono", () => {
    expect(canViewPainelTab("inexistente", canFor("owner"))).toBe(false)
  })
})
