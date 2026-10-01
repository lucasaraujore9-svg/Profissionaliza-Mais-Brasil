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
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NotificationBell } from "@/components/shared/notification-bell"
import { TourRunner } from "@/components/shared/tour/tour-runner"

interface SessionShape {
  studentId: string
  email: string
  name?: string
}

/**
 * "Minha assinatura" só aparece para quem assina. A maioria dos alunos compra
 * curso avulso e um item morto no menu deles seria ruído — e clicar levaria a
 * uma tela vazia explicando um produto que eles não contrataram.
 */
function navFor(hasSubscription: boolean) {
  return [
    { href: "/aluno", label: "Visão geral", icon: LayoutDashboard },
    { href: "/aluno/cursos", label: "Meus cursos", icon: GraduationCap },
    ...(hasSubscription
      ? [{ href: "/aluno/assinatura", label: "Minha assinatura", icon: Sparkles }]
      : []),
    { href: "/aluno/certificados", label: "Certificados", icon: Award },
    { href: "/aluno/comprar", label: "Comprar curso", icon: ShoppingBag },
    { href: "/aluno/pagamentos", label: "Pagamentos", icon: CreditCard },
    { href: "/aluno/suporte", label: "Suporte", icon: HelpCircle },
    { href: "/aluno/perfil", label: "Meu perfil", icon: UserCircle },
  ]
}

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
  hasSubscription: boolean
  storeName?: string
  logoUrl?: string
  onNavigate?: () => void
}

function SidebarContent({
  session,
  pathname,
  hasSubscription,
  storeName,
  logoUrl,
  onNavigate,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-[var(--menu-fg)]/10 px-6">
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
            <GraduationCap className="h-6 w-6 text-[var(--brand-ink)]" />
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
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--menu-fg)]/70">
            Área do aluno
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navFor(hasSubscription).map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/aluno" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-tour={`nav:${item.href}`}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "font-semibold text-[var(--shell-accent-on)]"
                  : "text-[var(--menu-fg)]/85 hover:bg-[var(--menu-fg)]/10 hover:text-[var(--menu-fg)]",
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

      <div className="border-t border-[var(--menu-fg)]/10 p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-[var(--shell-accent-on)]"
            style={{ backgroundColor: "var(--shell-accent)" }}
          >
            {initialsOf(session.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {session.name ?? "Aluno"}
            </p>
            <p className="truncate text-[10px] text-[var(--menu-fg)]/65">{session.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOutToLogin()}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--menu-fg)]/80 transition-colors hover:bg-[var(--menu-fg)]/10 hover:text-[var(--menu-fg)]"
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
  /** O aluno tem assinatura viva — libera o item "Minha assinatura" no menu. */
  hasSubscription?: boolean
  /**
   * Item ativo do menu (fundo + texto), já resolvidos pelo tema da unidade.
   * Ausentes = padrão da plataforma (lime com verde escuro).
   */
  brandAccent?: string
  brandAccentOn?: string
  /** Menu escuro (padrão) ou claro — escolha da unidade em /painel/vitrine. */
  menuTone?: "light" | "dark"
  /** Nome/marca da loja para exibir no shell. */
  storeName?: string
  /** Logo da loja. Cai pra logo PMB padrão se ausente. */
  logoUrl?: string
  /** Ids de tours guiados já dispensados por este aluno. */
  dismissedTours?: string[]
}

export function StudentShell({
  session,
  children,
  brandAccent,
  brandAccentOn,
  menuTone = "dark",
  storeName,
  logoUrl,
  dismissedTours = [],
  hasSubscription = false,
}: StudentShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // As cores da unidade chegam por :root (TenantThemeStyle, no layout). Aqui só
  // o que é do menu: o item ativo e se a barra é clara ou escura. `--menu-fg` é
  // o texto do menu; os tons mais fracos saem dele por opacidade.
  const styleVars = {
    "--shell-accent": brandAccent ?? "var(--color-pmb-lime)",
    "--shell-accent-on": brandAccentOn ?? "var(--brand-ink-900)",
  } as React.CSSProperties
  const menuSurface =
    menuTone === "dark"
      ? "bg-[var(--brand-dark)] text-[var(--menu-fg)] [--menu-fg:var(--brand-dark-on)]"
      : "border-r border-gray-200 bg-white text-[var(--menu-fg)] [--menu-fg:var(--brand-ink-900)]"

  return (
    <div className="flex min-h-screen bg-gray-50" style={styleVars}>
      {/* Sidebar desktop (lg+) */}
      <aside className={cn("hidden w-60 flex-col lg:flex", menuSurface)}>
        <SidebarContent
          session={session}
          pathname={pathname}
          hasSubscription={hasSubscription}
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
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col shadow-xl lg:hidden",
              menuSurface,
            )}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-md p-1 text-[var(--menu-fg)]/80 hover:bg-[var(--menu-fg)]/10"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              session={session}
              pathname={pathname}
              hasSubscription={hasSubscription}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("pmb:replay-tour"))
              }
              data-tour="tour-help"
              aria-label="Refazer tutorial"
              title="Refazer tutorial"
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:inline-flex"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            <NotificationBell />
          </div>
        </header>
        <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-10">{children}</div>
      </main>

      <TourRunner area="aluno" dismissed={dismissedTours} />
    </div>
  )
}
