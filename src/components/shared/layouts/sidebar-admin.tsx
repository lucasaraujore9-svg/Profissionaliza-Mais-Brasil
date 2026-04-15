"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  DollarSign,
  BookOpen,
  BarChart3,
  Settings,
  UserCog,
  ShoppingCart,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Role = "SUPER_ADMIN" | "PMB_SALES" | "PMB_RESELLER_MGR"

const ALL_ITEMS: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles: Role[]
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] },
  { href: "/admin/revendedores", label: "Revendedores", icon: Users, roles: ["SUPER_ADMIN", "PMB_RESELLER_MGR"] },
  { href: "/admin/vendas", label: "Vendas diretas", icon: ShoppingCart, roles: ["SUPER_ADMIN", "PMB_SALES"] },
  { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign, roles: ["SUPER_ADMIN"] },
  { href: "/admin/catalogo", label: "Catálogo", icon: BookOpen, roles: ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, roles: ["SUPER_ADMIN"] },
  { href: "/admin/equipe", label: "Equipe", icon: UserCog, roles: ["SUPER_ADMIN"] },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings, roles: ["SUPER_ADMIN"] },
]

export function SidebarAdmin({ role = "SUPER_ADMIN" }: { role?: Role } = {}) {
  const pathname = usePathname()
  const navItems = ALL_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside className="flex h-full w-60 flex-col bg-[var(--color-pmb-green)] text-white">
      <div className="flex h-20 items-center gap-3 px-6 border-b border-white/10">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
          <Image
            src="/images/logo.png"
            alt="PMB"
            width={40}
            height={40}
            className="h-7 w-auto"
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
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href))
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
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-pmb-gold)] text-xs font-bold text-[var(--color-pmb-green-900)]">
            AM
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">Admin Master</p>
            <p className="truncate text-[10px] text-white/65">admin@profissionaliza.com.br</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
