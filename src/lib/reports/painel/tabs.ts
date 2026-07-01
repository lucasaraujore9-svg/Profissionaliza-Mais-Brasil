/**
 * Abas do hub "Relatórios" do painel (revenda). Diferente do admin, o gate é
 * por CAPACIDADE do usuário na unidade (owner) e não por papel global. Tudo é
 * tenant-scoped no servidor; aqui só decidimos o que aparece.
 */
export interface PainelTabMeta {
  slug: string
  label: string
  icon: string
  /** Só o dono da unidade vê (consultores não). */
  ownerOnly?: boolean
}

export const PAINEL_TABS: PainelTabMeta[] = [
  { slug: "visao-geral", label: "Visão geral", icon: "bar-chart-3" },
  { slug: "receita", label: "Receita & vendas", icon: "trending-up" },
  { slug: "alunos", label: "Alunos & matrículas", icon: "graduation-cap" },
  { slug: "cursos-cupons", label: "Cursos & cupons", icon: "book-open" },
  { slug: "financeiro", label: "Financeiro", icon: "credit-card" },
  { slug: "indicacoes", label: "Indicações & rede", icon: "share-2", ownerOnly: true },
  { slug: "exportacoes", label: "Exportações", icon: "receipt" },
]

export function painelTab(slug: string): PainelTabMeta | undefined {
  return PAINEL_TABS.find((t) => t.slug === slug)
}

export function allowedPainelTabs(isOwner: boolean): PainelTabMeta[] {
  return PAINEL_TABS.filter((t) => !t.ownerOnly || isOwner)
}

export function canViewPainelTab(slug: string, isOwner: boolean): boolean {
  const tab = painelTab(slug)
  if (!tab) return false
  return !tab.ownerOnly || isOwner
}

export const DEFAULT_PAINEL_TAB = "visao-geral"
