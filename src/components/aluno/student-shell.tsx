"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  LayoutDashboard,
  CreditCard,
  GraduationCap,
  UserCircle,
  ShoppingBag,
  LogOut,
  Award,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NotificationBell } from "@/components/shared/notification-bell"

interface SessionShape {
  studentId: string
  email: string
  name?: string
}

const NAV = [
  { href: "/aluno", label: "Visão geral", icon: LayoutDashboard },
  { href: "/aluno/cursos", label: "Meus cursos", icon: GraduationCap },
  { href: "/aluno/certificados", label: "Certificados", icon: Award },
  { href: "/aluno/comprar", label: "Comprar curso", icon: ShoppingBag },
  { href: "/aluno/pagamentos", label: "Pagamentos", icon: CreditCard },
  { href: "/aluno/perfil", label: "Meu perfil", icon: UserCircle },
]

function initialsOf(name?: string): string {
  if (!name) return "AL"
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? ""
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (a + b).toUpperCase() || "AL"
}

export function StudentShell({
  session,
  children,
}: {
  session: SessionShape
  children: React.ReactNode
}) {
  const pathname = usePathname()
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-60 flex-col bg-[var(--color-pmb-green)] text-white">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
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
            <span className="font-display text-sm">Profissionaliza</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-pmb-lime)]">
              Área do aluno
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/aluno" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-pmb-lime)] font-semibold text-[var(--color-pmb-green-900)]"
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
              {initialsOf(session.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {session.name ?? "Aluno"}
              </p>
              <p className="truncate text-[10px] text-white/65">{session.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-3 border-b border-gray-200 bg-white px-6">
          <NotificationBell />
        </header>
        <div className="mx-auto max-w-5xl p-6 lg:p-10">{children}</div>
      </main>
    </div>
  )
}
