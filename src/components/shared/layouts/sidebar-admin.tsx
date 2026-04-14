"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  DollarSign,
  BookOpen,
  BarChart3,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/revendedores", label: "Revendedores", icon: Users },
  { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
  { href: "/admin/catalogo", label: "Catálogo", icon: BookOpen },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
]

export function SidebarAdmin() {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <Link href="/admin" className="text-lg font-bold text-[#1A1A2E]">
          PMB <span className="text-blue-600">Admin</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href))
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
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            AM
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#1A1A2E]">Admin Master</p>
            <p className="truncate text-[10px] text-gray-500">admin@profissionaliza.com.br</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
