"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOutToLogin } from "@/lib/auth/sign-out"
import {
  LayoutDashboard,
  CreditCard,
  GraduationCap,
  UserCircle,
  ShoppingBag,
  LogOut,
  Award,
  Menu,
  X,
  HelpCircle,
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
  { href: "/aluno/suporte", label: "Suporte", icon: HelpCircle },
  { href: "/aluno/perfil", label: "Meu perfil", icon: UserCircle },
]

function initialsOf(name?: string): string {
  if (!name) return "AL"
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? ""
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (a + b).toUpperCase() || "AL"
}

interface SidebarContentProps {
  session: SessionShape
  pathname: string
  storeName?: string
  logoUrl?: string
  onNavigate?: () => void
}

function SidebarContent({
  session,
  pathname,
  storeName,
  logoUrl,
  onNavigate,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
          {/* Logo da unidade se houver; revenda sem logo usa um ícone neutro
              (nunca a logo PMB). Só o contexto PMB puro (sem storeName) exibe a
              logo institucional. */}
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={storeName ?? "Logo"}
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          ) : storeName ? (
            <GraduationCap
              className="h-6 w-6"
              style={{ color: "var(--shell-accent)" }}
            />
          ) : (
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          )}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm">{storeName ?? "Profissionaliza"}</span>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--shell-accent)" }}
          >
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
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "font-semibold text-[color:var(--color-pmb-green-900,#0a3622)]"
                  : "text-white/85 hover:bg-white/10 hover:text-white",
              )}
              style={
                isActive
                  ? { backgroundColor: "var(--shell-accent)" }
                  : undefined
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-[color:var(--color-pmb-green-900,#0a3622)]"
            style={{ backgroundColor: "var(--shell-accent)" }}
          >
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
          onClick={() => void signOutToLogin()}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </>
  )
}

interface StudentShellProps {
  session: SessionShape
  children: React.ReactNode
  /** Cor primária do tenant (vitrine). Default = verde PMB. */
  brandPrimary?: string
  /** Cor de destaque do tenant. Default = lime PMB. */
  brandAccent?: string
  /** Nome/marca da loja para exibir no shell. */
  storeName?: string
  /** Logo da loja. Cai pra logo PMB padrão se ausente. */
  logoUrl?: string
}

export function StudentShell({
  session,
  children,
  brandPrimary,
  brandAccent,
  storeName,
  logoUrl,
}: StudentShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Tokens herdados do tenant da vitrine. Antes a área do aluno usava sempre
  // var(--color-pmb-green), ignorando o branding configurado em /painel/vitrine —
  // aluno em vitrine roxa via tudo verde PMB. Agora, se o layout pai injetou
  // primaryColor/secondaryColor, usamos esses; caso contrário, fallback para
  // os tokens PMB padrão.
  const styleVars: React.CSSProperties = {
    "--shell-primary": brandPrimary ?? "var(--color-pmb-green)",
    "--shell-accent": brandAccent ?? "var(--color-pmb-lime)",
  } as React.CSSProperties

  return (
    <div className="flex min-h-screen bg-gray-50" style={styleVars}>
      {/* Sidebar desktop (lg+) */}
      <aside
        className="hidden w-60 flex-col text-white lg:flex"
        style={{ backgroundColor: "var(--shell-primary)" }}
      >
        <SidebarContent
          session={session}
          pathname={pathname}
          storeName={storeName}
          logoUrl={logoUrl}
        />
      </aside>

      {/* Sidebar mobile (off-canvas) */}
      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col text-white shadow-xl lg:hidden"
            style={{ backgroundColor: "var(--shell-primary)" }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-md p-1 text-white/80 hover:bg-white/10"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              session={session}
              pathname={pathname}
              storeName={storeName}
              logoUrl={logoUrl}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 lg:justify-end lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <NotificationBell />
        </header>
        <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-10">{children}</div>
      </main>
    </div>
  )
}
