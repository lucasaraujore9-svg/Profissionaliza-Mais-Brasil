/**
 * Abas do hub "Relatórios" do painel (revenda).
 *
 * O gate é por PERMISSÃO na unidade (ver `lib/auth/painel-permissions`), não
 * por "é o dono". Tudo é tenant-scoped no servidor; aqui só decidimos o que
 * aparece — o dispatcher e o `[tab]/page.tsx` reforçam server-side.
 */

import type { PainelPermission } from "@/lib/auth/painel-permissions"

export interface PainelTabMeta {
  slug: string
  label: string
  icon: string
  /** Permissão exigida para a aba aparecer. */
  perm: PainelPermission
}

export const PAINEL_TABS: PainelTabMeta[] = [
  { slug: "visao-geral", label: "Visão geral", icon: "bar-chart-3", perm: "relatorios.view" },
  { slug: "receita", label: "Receita & vendas", icon: "trending-up", perm: "relatorios.view" },
  { slug: "alunos", label: "Alunos & matrículas", icon: "graduation-cap", perm: "relatorios.view" },
  { slug: "cursos-cupons", label: "Cursos & cupons", icon: "book-open", perm: "relatorios.view" },
  { slug: "financeiro", label: "Financeiro", icon: "credit-card", perm: "relatorios.financeiro" },
  { slug: "indicacoes", label: "Indicações & rede", icon: "share-2", perm: "relatorios.indicacoes" },
  { slug: "exportacoes", label: "Exportações", icon: "receipt", perm: "relatorios.view" },
]

export function painelTab(slug: string): PainelTabMeta | undefined {
  return PAINEL_TABS.find((t) => t.slug === slug)
}

export function allowedPainelTabs(
  can: (perm: PainelPermission) => boolean,
): PainelTabMeta[] {
  return PAINEL_TABS.filter((t) => can(t.perm))
}

export function canViewPainelTab(
  slug: string,
  can: (perm: PainelPermission) => boolean,
): boolean {
  const tab = painelTab(slug)
  if (!tab) return false
  return can(tab.perm)
}

export const DEFAULT_PAINEL_TAB = "visao-geral"
