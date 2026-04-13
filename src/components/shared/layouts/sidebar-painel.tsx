"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  GraduationCap,
  CreditCard,
  Palette,
  Settings,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/painel", label: "Dashboard", icon: LayoutDashboard },
  { href: "/painel/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/painel/alunos", label: "Alunos", icon: Users },
  { href: "/painel/cursos", label: "Cursos", icon: GraduationCap },
  { href: "/painel/financeiro", label: "Financeiro", icon: CreditCard },
  { href: "/painel/vitrine", label: "Minha Vitrine", icon: Palette },
  { href: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
]

export function SidebarPainel() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex w-60 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <Link href="/painel" className="text-lg font-bold text-gray-900">
          Meu <span className="text-blue-600">Painel</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/painel" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-600 font-semibold"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
