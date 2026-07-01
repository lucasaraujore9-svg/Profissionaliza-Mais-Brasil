import { describe, it, expect } from "vitest"
import { allowedPainelTabs, canViewPainelTab } from "./tabs"

describe("painel report tabs — gating por owner", () => {
  it("owner vê Indicações (owner-only)", () => {
    expect(canViewPainelTab("indicacoes", true)).toBe(true)
    expect(allowedPainelTabs(true).map((t) => t.slug)).toContain("indicacoes")
  })

  it("consultor (não-owner) NÃO vê Indicações", () => {
    expect(canViewPainelTab("indicacoes", false)).toBe(false)
    expect(allowedPainelTabs(false).map((t) => t.slug)).not.toContain("indicacoes")
  })

  it("abas operacionais visíveis para qualquer usuário do painel", () => {
    for (const slug of ["visao-geral", "receita", "alunos", "cursos-cupons", "financeiro", "exportacoes"]) {
      expect(canViewPainelTab(slug, false)).toBe(true)
      expect(canViewPainelTab(slug, true)).toBe(true)
    }
  })

  it("aba inexistente é negada", () => {
    expect(canViewPainelTab("inexistente", true)).toBe(false)
  })
})
