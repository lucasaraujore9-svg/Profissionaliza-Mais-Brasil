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
  Store,
  Trophy,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  ownerOnly?: boolean
  automationOnly?: boolean
  /** Só aparece quando o módulo "revender revendas" está habilitado na unidade. */
  resellerSellerOnly?: boolean
  /** Sub-itens exibidos (indentados) quando a seção está ativa. */
  children?: { href: string; label: string }[]
}

const ALL_ITEMS: NavItem[] = [
  { href: "/painel", label: "Dashboard", icon: LayoutDashboard },
  { href: "/painel/treinamentos", label: "Treinamentos", icon: Video },
  { href: "/painel/cursos", label: "Catálogo", icon: GraduationCap },
  { href: "/painel/alunos", label: "Alunos", icon: Users },
  { href: "/painel/atendimento", label: "Atendimento", icon: LifeBuoy, ownerOnly: true },
  { href: "/painel/leads", label: "Leads", icon: Inbox, ownerOnly: true, automationOnly: true },
  { href: "/painel/vendas", label: "Vendas diretas", icon: ShoppingCart },
  {
    href: "/painel/revendas",
    label: "Revendedor",
    icon: Store,
    ownerOnly: true,
    resellerSellerOnly: true,
    children: [
      { href: "/painel/revendas/nova", label: "Criar revenda" },
      { href: "/painel/revendas/leads", label: "Leads revendas" },
    ],
  },
  // Placar de indicações: scoreboard das revendas que ele indicou (mesmo módulo
  // de revender revendas). Item próprio para acender/destacar corretamente.
  {
    href: "/painel/placar",
    label: "Placar",
    icon: Trophy,
    ownerOnly: true,
    resellerSellerOnly: true,
  },
  { href: "/painel/cupons", label: "Cupons", icon: Tag },
  { href: "/painel/financeiro", label: "Financeiro", icon: CreditCard },
  { href: "/painel/indicacoes", label: "Indicações", icon: Share2, ownerOnly: true },
  { href: "/painel/certificados", label: "Certificados", icon: Award, ownerOnly: true },
  { href: "/painel/equipe", label: "Equipe", icon: UserCog, ownerOnly: true },
  { href: "/painel/comunicacao", label: "Comunicação", icon: MessageSquare, ownerOnly: true },
  { href: "/painel/automacao", label: "Automação", icon: Zap, ownerOnly: true, automationOnly: true },
  { href: "/painel/dominio", label: "Domínio", icon: Globe, ownerOnly: true },
  { href: "/painel/vitrine", label: "Vitrine", icon: Palette, ownerOnly: true },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings, ownerOnly: true },
]

interface SidebarPainelProps {
  tenantName?: string
  tenantLogoUrl?: string
  userEmail?: string
  isOwner?: boolean
  automationEnabled?: boolean
  canSellResellers?: boolean
}

export function SidebarPainel({
  tenantName,
  tenantLogoUrl,
  userEmail,
  isOwner = true,
  automationEnabled = false,
  canSellResellers = false,
}: SidebarPainelProps) {
  const pathname = usePathname()
  // Itens de automação continuam VISÍVEIS mesmo sem o módulo ativo — ao clicar,
  // a página mostra o paywall (fundo desfocado + pop-up comercial). Só ocultamos
  // por papel (ownerOnly). "Revendas" depende do módulo canSellResellers (o
  // acesso é reforçado server-side por requireResellerSeller).
  const navItems = ALL_ITEMS.filter((item) => {
    if (item.ownerOnly && !isOwner) return false
    if (item.resellerSellerOnly && !canSellResellers) return false
    return true
  })

  return (
    <aside className="flex h-full w-60 flex-col bg-[var(--color-pmb-green-700)] text-white lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
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
        <div className="flex flex-col leading-tight min-w-0">
          <span className="font-display text-sm text-white truncate">
            {tenantName ?? "Meu Painel"}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-pmb-lime)]">
            Revendedor
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          // Casa em fronteira de segmento (href + "/") para nao acender itens
          // cujo href e prefixo de string de outro.
          const sectionActive =
            pathname === item.href ||
            (item.href !== "/painel" && pathname.startsWith(item.href + "/"))
          // Itens com filhos só destacam o pai no href EXATO (o dashboard da
          // seção); dentro de um filho, a seção expande e o destaque vai ao filho.
          const isActive = item.children ? pathname === item.href : sectionActive
          const locked = !!item.automationOnly && !automationEnabled
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                data-tour={`nav:${item.href}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green-900)] font-semibold"
                    : "text-white/85 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1">{item.label}</span>
                {locked && (
                  <Lock
                    className={cn(
                      "h-3.5 w-3.5",
                      isActive ? "text-[var(--color-pmb-green-900)]/50" : "text-white/45",
                    )}
                    aria-label="Recurso premium"
                  />
                )}
              </Link>
              {item.children && sectionActive && (
                <div className="mt-1 space-y-1 pl-6">
                  {item.children.map((child) => {
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

      <div className="border-t border-white/10 px-6 py-4 text-xs">
        <div className="font-semibold text-white truncate">
          {tenantName ?? "Escola"}
        </div>
        <div className="truncate text-white/65">
          {userEmail ?? "revendedor@empresa.com"}
        </div>
      </div>
    </aside>
  )
}
