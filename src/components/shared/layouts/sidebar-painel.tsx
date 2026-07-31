"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  Tag,
  CreditCard,
  Globe,
  Palette,
  Settings,
  UserCog,
  ShoppingCart,
  Award,
  Share2,
  MessageSquare,
  Zap,
  Inbox,
  LifeBuoy,
  Lock,
  Video,
  Images,
  Store,
  ReceiptText,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  roleLabel,
  type PainelMemberRole,
  type PainelPermission,
} from "@/lib/auth/painel-permissions"

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  /** Permissão exigida para o item aparecer. Ver lib/auth/painel-permissions. */
  perm: PainelPermission
  automationOnly?: boolean
  /** Só aparece quando o módulo "revender revendas" está habilitado na unidade. */
  resellerSellerOnly?: boolean
  /**
   * Sub-itens exibidos (indentados) quando a seção está ativa. `perm` própria
   * quando o sub-item é mais restrito que a seção — o pai abre para leitura e
   * só quem escreve enxerga a ação de criar.
   */
  children?: { href: string; label: string; perm?: PainelPermission }[]
}

// O item do menu gateia pela permissão de LEITURA da área. Gatear por `.manage`
// escondia a tela de quem tinha acesso somente-leitura: a pessoa alcançava a
// página pela URL, mas não pelo menu.
const ALL_ITEMS: NavItem[] = [
  { href: "/painel", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/painel/treinamentos", label: "Treinamentos", icon: Video, perm: "treinamentos.view" },
  { href: "/painel/artes", label: "Artes de divulgação", icon: Images, perm: "artes.view" },
  { href: "/painel/cursos", label: "Catálogo", icon: GraduationCap, perm: "catalogo.view" },
  { href: "/painel/alunos", label: "Alunos", icon: Users, perm: "alunos.view" },
  { href: "/painel/atendimento", label: "Atendimento", icon: LifeBuoy, perm: "atendimento.view" },
  { href: "/painel/leads", label: "Leads", icon: Inbox, perm: "leads.view", automationOnly: true },
  { href: "/painel/vendas", label: "Vendas diretas", icon: ShoppingCart, perm: "vendas.view" },
  {
    href: "/painel/revendas",
    label: "Revendedor",
    icon: Store,
    perm: "revendas.view",
    resellerSellerOnly: true,
    children: [
      { href: "/painel/revendas/nova", label: "Criar revenda", perm: "revendas.manage" },
      { href: "/painel/revendas/leads", label: "Leads revendas" },
      // Placar de indicações: scoreboard das revendas que ele indicou.
      { href: "/painel/placar", label: "Placar" },
    ],
  },
  { href: "/painel/cupons", label: "Cupons", icon: Tag, perm: "cupons.view" },
  { href: "/painel/financeiro", label: "Financeiro", icon: CreditCard, perm: "financeiro.view" },
  // Mensalidade que a unidade paga para a PMB (não confundir com "Financeiro",
  // que é o dinheiro que entra das vendas para alunos). Fora de todos os
  // presets: só o dono, salvo concessão explícita em /painel/equipe.
  { href: "/painel/cobrancas", label: "Minhas cobranças", icon: ReceiptText, perm: "cobrancas.view" },
  // Hub de BI da unidade (tenant-scoped). Cada aba tem a própria permissão,
  // reforçada server-side no dispatcher e no [tab]/page.tsx.
  { href: "/painel/relatorios", label: "Relatórios", icon: BarChart3, perm: "relatorios.view" },
  { href: "/painel/indicacoes", label: "Indicações", icon: Share2, perm: "indicacoes.view" },
  { href: "/painel/certificados", label: "Certificados", icon: Award, perm: "certificados.view" },
  { href: "/painel/equipe", label: "Equipe", icon: UserCog, perm: "equipe.view" },
  { href: "/painel/comunicacao", label: "Comunicação", icon: MessageSquare, perm: "comunicacao.view" },
  { href: "/painel/automacao", label: "Automação", icon: Zap, perm: "automacao.view", automationOnly: true },
  { href: "/painel/dominio", label: "Domínio", icon: Globe, perm: "dominio.view" },
  { href: "/painel/vitrine", label: "Vitrine", icon: Palette, perm: "vitrine.view" },
  // A tela é a do PRÓPRIO cadastro e da própria senha (a página exige
  // `perfil.edit`); as abas da conta dentro dela têm gate próprio. Gatear o menu
  // por `configuracoes.manage` escondia de quase todo mundo o único lugar onde
  // se troca a própria senha.
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings, perm: "perfil.edit" },
]

interface SidebarPainelProps {
  tenantName?: string
  tenantLogoUrl?: string
  userEmail?: string
  /**
   * Permissões efetivas do usuário, resolvidas server-side em
   * `src/app/painel/layout.tsx`. Obrigatória e SEM default de propósito: o bug
   * que motivou esta refatoração era exatamente um default permissivo
   * (`isOwner = true`) que a layout nunca sobrescrevia — todo membro da equipe
   * recebia o menu completo do dono.
   */
  permissions: PainelPermission[]
  /** Papel do usuário na unidade — exibido sob o nome da escola. */
  memberRole?: PainelMemberRole
  automationEnabled?: boolean
  canSellResellers?: boolean
  /** Menu recolhido (só ícones). Aplicado só na instância desktop. */
  collapsed?: boolean
  /** Handler do botão de recolher/expandir. Ausente = não renderiza o botão
   * (usado na instância mobile, que é sempre um drawer expandido). */
  onToggleCollapse?: () => void
}

export function SidebarPainel({
  tenantName,
  tenantLogoUrl,
  userEmail,
  permissions,
  memberRole = "owner",
  automationEnabled = false,
  canSellResellers = false,
  collapsed = false,
  onToggleCollapse,
}: SidebarPainelProps) {
  const pathname = usePathname()
  const granted = new Set(permissions)
  // Itens de automação continuam VISÍVEIS mesmo sem o módulo ativo — ao clicar,
  // a página mostra o paywall (fundo desfocado + pop-up comercial). Só ocultamos
  // por permissão. "Revendas" exige, além da permissão, o módulo canSellResellers
  // (o acesso é reforçado server-side por requireResellerSeller).
  const navItems = ALL_ITEMS.filter((item) => {
    if (!granted.has(item.perm)) return false
    if (item.resellerSellerOnly && !canSellResellers) return false
    return true
  })

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col bg-[var(--color-pmb-green-700)] text-white transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute right-0 top-7 z-50 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-[var(--color-pmb-green-700)] shadow-md transition-colors hover:bg-[var(--color-pmb-lime-50)]"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      )}
      <div
        className={cn(
          "flex h-20 items-center border-b border-white/10",
          collapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
          {tenantLogoUrl ? (
            <Image
              src={tenantLogoUrl}
              alt={tenantName ?? "Logo da escola"}
              width={40}
              height={40}
              className="h-full w-full object-contain"
              unoptimized
            />
          ) : (
            <Image
              src="/images/logo.png"
              alt="PMB"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          )}
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-sm text-white">
              {tenantName ?? "Meu Painel"}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-pmb-lime)]">
              {roleLabel(memberRole)}
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map((item) => {
          // Casa em fronteira de segmento (href + "/") para nao acender itens
          // cujo href e prefixo de string de outro. Tambem mantem a secao aberta
          // quando estamos num FILHO cujo href esta fora do prefixo do pai (ex.:
          // /painel/placar dentro da secao /painel/revendas).
          const onChild =
            item.children?.some(
              (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
            ) ?? false
          const sectionActive =
            pathname === item.href ||
            (item.href !== "/painel" && pathname.startsWith(item.href + "/")) ||
            onChild
          // Itens com filhos só destacam o pai no href EXATO (o dashboard da
          // seção); dentro de um filho, a seção expande e o destaque vai ao filho.
          const isActive = item.children ? pathname === item.href : sectionActive
          const locked = !!item.automationOnly && !automationEnabled
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                data-tour={`nav:${item.href}`}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "gap-3 px-4",
                  isActive
                    ? "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green-900)] font-semibold"
                    : "text-white/85 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && locked && (
                  <Lock
                    className={cn(
                      "h-3.5 w-3.5",
                      isActive ? "text-[var(--color-pmb-green-900)]/50" : "text-white/45",
                    )}
                    aria-label="Recurso premium"
                  />
                )}
              </Link>
              {!collapsed && item.children && sectionActive && (
                <div className="mt-1 space-y-1 pl-6">
                  {item.children.map((child) => {
                    // Sub-item mais restrito que a seção (ex.: "Criar revenda"
                    // sob uma seção aberta para leitura).
                    if (child.perm && !granted.has(child.perm)) return null
                    const childActive =
                      pathname === child.href || pathname.startsWith(child.href + "/")
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-lg px-4 py-2 text-sm transition-colors",
                          childActive
                            ? "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green-900)] font-semibold"
                            : "text-white/75 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-white/10 px-6 py-4 text-xs">
          <div className="truncate font-semibold text-white">
            {tenantName ?? "Escola"}
          </div>
          <div className="truncate text-white/65">
            {userEmail ?? "revendedor@empresa.com"}
          </div>
        </div>
      )}
    </aside>
  )
}
