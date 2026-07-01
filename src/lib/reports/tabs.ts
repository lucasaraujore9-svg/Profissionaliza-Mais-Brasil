import type { UserRole } from "@prisma/client"

/**
 * Fonte única das abas do hub admin "Relatórios": metadados + allowlist por
 * papel + aba padrão por papel. Consumido pela page (redirect), pelo
 * `[tab]/page.tsx` (gate), pela barra de abas e pelo dispatcher da API.
 */
export interface ReportTabMeta {
  slug: string
  label: string
  /** Nome de ícone lucide (registro em src/components/reports/icons.ts). */
  icon: string
  roles: UserRole[]
  /** Papéis para os quais esta é a aba de entrada (usada no redirect raiz). */
  defaultFor?: UserRole[]
}

const ALL: UserRole[] = [
  "SUPER_ADMIN",
  "PMB_FINANCEIRO",
  "PMB_SALES",
  "PMB_SALES_MGR",
  "PMB_REVENDA_SALES",
  "PMB_RESELLER_MGR",
]

export const REPORT_TABS: ReportTabMeta[] = [
  {
    slug: "visao-geral",
    label: "Visão geral",
    icon: "bar-chart-3",
    roles: ALL,
    defaultFor: ["SUPER_ADMIN"],
  },
  {
    slug: "receita-vendas",
    label: "Receita & vendas",
    icon: "trending-up",
    roles: ["SUPER_ADMIN", "PMB_FINANCEIRO", "PMB_SALES"],
    defaultFor: ["PMB_SALES"],
  },
  {
    slug: "alunos-matriculas",
    label: "Alunos & matrículas",
    icon: "graduation-cap",
    roles: ["SUPER_ADMIN", "PMB_SALES"],
  },
  {
    slug: "rede-revendedores",
    label: "Revendedores",
    icon: "store",
    roles: ["SUPER_ADMIN", "PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_RESELLER_MGR"],
    defaultFor: ["PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_RESELLER_MGR"],
  },
  {
    slug: "financeiro",
    label: "Financeiro",
    icon: "dollar-sign",
    roles: ["SUPER_ADMIN", "PMB_FINANCEIRO"],
    defaultFor: ["PMB_FINANCEIRO"],
  },
  {
    slug: "indicacoes-comissoes",
    label: "Indicações & comissões",
    icon: "share-2",
    roles: ["SUPER_ADMIN", "PMB_FINANCEIRO", "PMB_RESELLER_MGR"],
  },
  {
    slug: "cursos-cupons",
    label: "Cursos & cupons",
    icon: "book-open",
    roles: ["SUPER_ADMIN", "PMB_SALES"],
  },
  {
    slug: "leads-conversao",
    label: "Leads & conversão",
    icon: "inbox",
    roles: ["SUPER_ADMIN", "PMB_SALES_MGR", "PMB_REVENDA_SALES"],
  },
  {
    slug: "exportacoes",
    label: "Exportações",
    icon: "receipt",
    roles: ALL,
  },
]

export function reportTab(slug: string): ReportTabMeta | undefined {
  return REPORT_TABS.find((t) => t.slug === slug)
}

export function allowedTabs(role: UserRole): ReportTabMeta[] {
  return REPORT_TABS.filter((t) => t.roles.includes(role))
}

export function canViewTab(role: UserRole, slug: string): boolean {
  const tab = reportTab(slug)
  return !!tab && tab.roles.includes(role)
}

/** Aba de entrada do papel (primeira `defaultFor`, senão a 1ª permitida). */
export function defaultTab(role: UserRole): string {
  const preferred = REPORT_TABS.find((t) => t.defaultFor?.includes(role))
  if (preferred) return preferred.slug
  const first = allowedTabs(role)[0]
  return first?.slug ?? "visao-geral"
}
