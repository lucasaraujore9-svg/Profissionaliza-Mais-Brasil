"use client"

import Link from "next/link"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/painel", label: "Dashboard", icon: LayoutDashboard },
  { href: "/painel/cursos", label: "Cursos", icon: GraduationCap },
  { href: "/painel/alunos", label: "Alunos", icon: Users },
  { href: "/painel/cupons", label: "Cupons", icon: Tag },
  { href: "/painel/financeiro", label: "Financeiro", icon: CreditCard },
  { href: "/painel/dominio", label: "Domínio", icon: Globe },
  { href: "/painel/vitrine", label: "Vitrine", icon: Palette },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
]

export function SidebarPainel() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <Link href="/painel" className="text-lg font-bold text-[#1A1A2E]">
          Meu <span className="text-blue-600">Painel</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/painel" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-gray-200 px-6 py-4 text-xs text-gray-500">
        <div className="font-semibold text-[#1A1A2E]">Educa+ Cursos</div>
        <div className="truncate">revendedor@empresa.com</div>
      </div>
    </aside>
  )
}
