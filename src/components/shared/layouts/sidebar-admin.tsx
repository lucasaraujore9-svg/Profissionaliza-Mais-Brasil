"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOutToLogin } from "@/lib/auth/sign-out"
import {
  LayoutDashboard,
  Users,
  DollarSign,
  BookOpen,
  BarChart3,
  Settings,
  UserCog,
  ShoppingCart,
  UserCircle,
  GraduationCap,
  LogOut,
  Award,
  Share2,
  MessageSquare,
  Palette,
  Zap,
  Inbox,
  LifeBuoy,
  Building2,
  Video,
  Images,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { AdminPermission } from "@/lib/auth/admin-permissions"

/**
 * Itens do menu com a permissão que cada um exige. A visibilidade do menu e o
 * guard da rota leem a MESMA fonte (`lib/auth/admin-permissions.ts`) — antes a
 * lista de papéis vivia aqui e divergia das rotas (Financeiro aparecia para o
 * vendedor de curso e a tela abria vazia com 403 na única aba).
 */
const ALL_ITEMS: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  permission: AdminPermission
  /** Item alternativo: some quando a pessoa também tem `hiddenWhen`. */
  hiddenWhen?: AdminPermission
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  // Unidades: cada papel só enxerga as atribuídas a ele (escopo aplicado nas
  // queries via `admin-guard`).
  { href: "/admin/revendedores", label: "Revendedores", icon: Users, permission: "unidades.view" },
  { href: "/admin/leads-revenda", label: "Leads de revenda", icon: Building2, permission: "leadsRevenda.view" },
  { href: "/admin/alunos", label: "Alunos", icon: GraduationCap, permission: "alunosRede.view" },
  // `alunosRede.view` (não `alunos.view`): a fila alcança aluno de qualquer
  // unidade. Gateada pela LEITURA — quem só consulta precisa achar a tela pelo
  // menu, e não só pela URL; a escrita é gateada na própria rota.
  { href: "/admin/alunos/titularidade", label: "Titularidade", icon: UserCog, permission: "alunosRede.view" },
  { href: "/admin/leads", label: "Leads", icon: Inbox, permission: "leads.view" },
  { href: "/admin/atendimento", label: "Atendimento", icon: LifeBuoy, permission: "atendimento.view" },
  { href: "/admin/vendas", label: "Vendas diretas", icon: ShoppingCart, permission: "vendas.view" },
  { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign, permission: "financeiro.view" },
  { href: "/admin/indicacoes", label: "Indicações", icon: Share2, permission: "indicacoes.view" },
  { href: "/admin/certificados", label: "Certificados", icon: Award, permission: "certificados.view" },
  { href: "/admin/catalogo", label: "Catálogo", icon: BookOpen, permission: "catalogo.view" },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: Sparkles, permission: "assinaturas.view" },
  { href: "/admin/vitrine", label: "Vitrine", icon: Palette, permission: "vitrine.view" },
  // Hub de BI "Relatórios" (absorveu o antigo Analytics). A visibilidade fina
  // por aba vem de `lib/reports/tabs.ts`, também por permissão.
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3, permission: "relatorios.view" },
  { href: "/admin/equipe", label: "Equipe", icon: UserCog, permission: "equipe.view" },
  { href: "/admin/comunicacao", label: "Comunicação", icon: MessageSquare, permission: "comunicacao.view" },
  { href: "/admin/treinamentos", label: "Treinamentos", icon: Video, permission: "treinamentos.manage" },
  { href: "/admin/artes", label: "Artes", icon: Images, permission: "artes.view" },
  // Quem gerencia os treinamentos assiste pela própria tela de gestão (botão
  // "Assistir") — daí o `hiddenWhen`, que evita o item duplicado no menu.
  {
    href: "/admin/treinamentos/assistir",
    label: "Treinamentos",
    icon: Video,
    permission: "treinamentos.view",
    hiddenWhen: "treinamentos.manage",
  },
  { href: "/admin/automacao", label: "Automação", icon: Zap, permission: "automacao.view" },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings, permission: "configuracoes.view" },
  { href: "/admin/meu-perfil", label: "Meu perfil", icon: UserCircle, permission: "perfil.edit" },
]

function initialsOf(name?: string): string {
  if (!name) return "AM"
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? ""
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (a + b).toUpperCase() || "AM"
}

interface Props {
  /** Permissões efetivas de quem está logado (ver `admin-guard`). */
  permissions?: readonly AdminPermission[]
  userName?: string
  userEmail?: string
  /** Menu recolhido (só ícones). Aplicado só na instância desktop. */
  collapsed?: boolean
  /** Handler do botão de recolher/expandir. Ausente = não renderiza o botão
   * (usado na instância mobile, que é sempre um drawer expandido). */
  onToggleCollapse?: () => void
}

export function SidebarAdmin({
  permissions = [],
  userName,
  userEmail,
  collapsed = false,
  onToggleCollapse,
}: Props = {}) {
  const pathname = usePathname()
  const granted = new Set<AdminPermission>(permissions)
  const navItems = ALL_ITEMS.filter(
    (item) =>
      granted.has(item.permission) &&
      !(item.hiddenWhen && granted.has(item.hiddenWhen)),
  )

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col bg-[var(--color-pmb-green)] text-white transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute right-0 top-7 z-50 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-[var(--color-pmb-green)] shadow-md transition-colors hover:bg-[var(--color-pmb-lime-50)]"
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
          <Image
            src="/images/logo.png"
            alt="PMB"
            width={40}
            height={40}
            className="h-full w-full object-contain"
          />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-sm text-white">Profissionaliza</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-pmb-lime)]">
              Admin Master
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map((item) => {
          // Casa em fronteira de segmento (href + "/") para nao acender itens
          // cujo href e prefixo de string de outro (ex: /admin/leads vs
          // /admin/leads-revenda).
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href + "/"))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-3 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2" : "gap-3 px-4",
                isActive
                  ? "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green-900)] font-semibold"
                  : "text-white/85 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={cn("border-t border-white/10", collapsed ? "p-2" : "p-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/admin/meu-perfil"
              title={userName ?? "Admin"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-pmb-gold)] text-xs font-bold text-[var(--color-pmb-green-900)]"
            >
              {initialsOf(userName)}
            </Link>
            <button
              type="button"
              onClick={() => void signOutToLogin()}
              aria-label="Sair da conta"
              title="Sair da conta"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Link
              href="/admin/meu-perfil"
              className="-m-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/10"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-pmb-gold)] text-xs font-bold text-[var(--color-pmb-green-900)]">
                {initialsOf(userName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">
                  {userName ?? "Admin"}
                </p>
                <p className="truncate text-[10px] text-white/65">{userEmail ?? ""}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => void signOutToLogin()}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
