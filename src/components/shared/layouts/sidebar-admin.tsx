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
  FileText,
  LogOut,
  Award,
  Share2,
  MessageSquare,
  Palette,
  Zap,
  Inbox,
  LifeBuoy,
  Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Role = "SUPER_ADMIN" | "PMB_SALES" | "PMB_SALES_MGR" | "PMB_REVENDA_SALES" | "PMB_RESELLER_MGR"

const ALL_ITEMS: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles: Role[]
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_RESELLER_MGR"] },
  // Unidades: visíveis para suporte (account manager) e para o comercial de
  // revenda (gerente de vendas + vendedor de revenda). Cada papel só enxerga
  // as unidades atribuídas a ele (escopo aplicado na rota/queries).
  { href: "/admin/revendedores", label: "Revendedores", icon: Users, roles: ["SUPER_ADMIN", "PMB_RESELLER_MGR", "PMB_SALES_MGR", "PMB_REVENDA_SALES"] },
  // Funil B2B: time de revenda (gerente de vendas + vendedor de revenda).
  { href: "/admin/leads-revenda", label: "Leads de revenda", icon: Building2, roles: ["SUPER_ADMIN", "PMB_SALES_MGR", "PMB_REVENDA_SALES"] },
  // Lista de alunos (vitrine PMB B2C): super + vendedor de curso (escopado).
  { href: "/admin/alunos", label: "Alunos", icon: GraduationCap, roles: ["SUPER_ADMIN", "PMB_SALES"] },
  { href: "/admin/leads", label: "Leads", icon: Inbox, roles: ["SUPER_ADMIN", "PMB_SALES"] },
  { href: "/admin/atendimento", label: "Atendimento", icon: LifeBuoy, roles: ["SUPER_ADMIN", "PMB_SALES"] },
  { href: "/admin/vendas", label: "Vendas diretas", icon: ShoppingCart, roles: ["SUPER_ADMIN", "PMB_SALES"] },
  // Financeiro: super (visão geral + mensalidades) e, só para "Comissões a
  // pagar" (escopado), vendedor de curso e gerente de suporte.
  { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] },
  { href: "/admin/indicacoes", label: "Indicações", icon: Share2, roles: ["SUPER_ADMIN", "PMB_RESELLER_MGR"] },
  { href: "/admin/certificados", label: "Certificados", icon: Award, roles: ["SUPER_ADMIN"] },
  { href: "/admin/catalogo", label: "Catálogo", icon: BookOpen, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_RESELLER_MGR"] },
  { href: "/admin/vitrine", label: "Vitrine", icon: Palette, roles: ["SUPER_ADMIN"] },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, roles: ["SUPER_ADMIN"] },
  // Relatórios: papéis modelados pelos runners (os comerciais de revenda não
  // são escopados, por isso ficam de fora — ver /api/admin/relatorios).
  { href: "/admin/relatorios", label: "Relatórios", icon: FileText, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] },
  { href: "/admin/equipe", label: "Equipe", icon: UserCog, roles: ["SUPER_ADMIN"] },
  { href: "/admin/comunicacao", label: "Comunicação", icon: MessageSquare, roles: ["SUPER_ADMIN"] },
  { href: "/admin/automacao", label: "Automação", icon: Zap, roles: ["SUPER_ADMIN"] },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings, roles: ["SUPER_ADMIN"] },
  { href: "/admin/meu-perfil", label: "Meu perfil", icon: UserCircle, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_RESELLER_MGR"] },
]

function initialsOf(name?: string): string {
  if (!name) return "AM"
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? ""
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (a + b).toUpperCase() || "AM"
}

interface Props {
  role?: Role
  userName?: string
  userEmail?: string
}

export function SidebarAdmin({
  role = "SUPER_ADMIN",
  userName,
  userEmail,
}: Props = {}) {
  const pathname = usePathname()
  const navItems = ALL_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside className="flex h-full w-60 flex-col bg-[var(--color-pmb-green)] text-white">
      <div className="flex h-20 items-center gap-3 px-6 border-b border-white/10">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
          <Image
            src="/images/logo.png"
            alt="PMB"
            width={40}
            height={40}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm text-white">Profissionaliza</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-pmb-lime)]">
            Admin Master
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
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
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green-900)] font-semibold"
                  : "text-white/85 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <Link
          href="/admin/meu-perfil"
          className="flex items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-white/10"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-pmb-gold)] text-xs font-bold text-[var(--color-pmb-green-900)]">
            {initialsOf(userName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {userName ?? "Admin"}
            </p>
            <p className="truncate text-[10px] text-white/65">
              {userEmail ?? ""}
            </p>
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
      </div>
    </aside>
  )
}
