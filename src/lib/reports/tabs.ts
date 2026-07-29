import type { PmbTeamRole } from "@/lib/auth/roles"
import type { AdminPermission } from "@/lib/auth/admin-permissions"

/**
 * Fonte única das abas do hub admin "Relatórios": metadados + permissão exigida
 * + aba padrão por papel. Consumido pela page (redirect), pelo `[tab]/page.tsx`
 * (gate), pela barra de abas e pelo dispatcher da API.
 *
 * Cada aba exige UMA permissão do catálogo (`lib/auth/admin-permissions.ts`).
 * A matriz por papel não vive mais aqui: ela é consequência dos presets — e,
 * com isso, o super admin pode liberar uma aba isolada para uma pessoa sem
 * mexer no papel dela.
 */
export interface ReportTabMeta {
  slug: string
  label: string
  /** Nome de ícone lucide (registro em src/components/reports/icons.ts). */
  icon: string
  permission: AdminPermission
  /** Papéis para os quais esta é a aba de entrada (usada no redirect raiz). */
  defaultFor?: PmbTeamRole[]
}

export const REPORT_TABS: ReportTabMeta[] = [
  {
    // Resumo executivo do ecossistema (MRR de todas as revendas, top revendas
    // por GMV, funil global). Sem recorte por papel viável → permissão própria,
    // fora dos presets de escopo limitado. Espelha o least-privilege do export.
    slug: "visao-geral",
    label: "Visão geral",
    icon: "bar-chart-3",
    permission: "relatorios.visaoGeral",
    defaultFor: ["SUPER_ADMIN"],
  },
  {
    // O vendedor de curso (B2C) é forçado ao segmento PMB no módulo
    // (receita-vendas.ts) — nunca vê receita de revendedores.
    slug: "receita-vendas",
    label: "Receita & vendas",
    icon: "trending-up",
    permission: "relatorios.receitaVendas",
    defaultFor: ["PMB_SALES"],
  },
  {
    // Ecossistêmico (base total de alunos + alunos por revendedor). Sem variante
    // PMB-escopada limpa → só quem tem a permissão dedicada.
    slug: "alunos-matriculas",
    label: "Alunos & matrículas",
    icon: "graduation-cap",
    permission: "relatorios.alunos",
  },
  {
    slug: "rede-revendedores",
    label: "Revendedores",
    icon: "store",
    permission: "relatorios.revendedores",
    defaultFor: [
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_RESELLER_DIRECTOR",
      "PMB_RESELLER_MGR",
    ],
  },
  {
    slug: "financeiro",
    label: "Financeiro",
    icon: "dollar-sign",
    permission: "relatorios.financeiro",
    defaultFor: ["PMB_FINANCEIRO"],
  },
  {
    slug: "indicacoes-comissoes",
    label: "Indicações & comissões",
    icon: "share-2",
    permission: "relatorios.indicacoes",
  },
  {
    // Ecossistêmico (cursos/cupons de todos os tenants). Sem variante
    // PMB-escopada limpa → permissão dedicada.
    slug: "cursos-cupons",
    label: "Cursos & cupons",
    icon: "book-open",
    permission: "relatorios.cursos",
  },
  {
    slug: "leads-conversao",
    label: "Leads & conversão",
    icon: "inbox",
    permission: "relatorios.leads",
  },
  {
    slug: "exportacoes",
    label: "Exportações",
    icon: "receipt",
    permission: "relatorios.export",
  },
]

export function reportTab(slug: string): ReportTabMeta | undefined {
  return REPORT_TABS.find((t) => t.slug === slug)
}

export function allowedTabs(
  permissions: ReadonlySet<AdminPermission>,
): ReportTabMeta[] {
  return REPORT_TABS.filter((t) => permissions.has(t.permission))
}

export function canViewTab(
  permissions: ReadonlySet<AdminPermission>,
  slug: string,
): boolean {
  const tab = reportTab(slug)
  return !!tab && permissions.has(tab.permission)
}

/**
 * Aba de entrada: a `defaultFor` do papel quando a pessoa ainda a alcança,
 * senão a primeira permitida. `null` quando não sobra nenhuma — o chamador
 * decide o destino (a página manda para a home acessível da pessoa).
 */
export function defaultTab(
  role: PmbTeamRole,
  permissions: ReadonlySet<AdminPermission>,
): string | null {
  const preferred = REPORT_TABS.find(
    (t) => t.defaultFor?.includes(role) && permissions.has(t.permission),
  )
  if (preferred) return preferred.slug
  return allowedTabs(permissions)[0]?.slug ?? null
}
