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

interface SidebarPainelProps {
  tenantName?: string
  userEmail?: string
}

export function SidebarPainel({ tenantName, userEmail }: SidebarPainelProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 flex-col bg-[var(--color-pmb-green-700)] text-white lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
          <Image
            src="/images/logo.png"
            alt="PMB"
            width={40}
            height={40}
            className="h-7 w-auto"
          />
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
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/painel" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
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
