"use client"

import { SidebarPainel } from "@/components/shared/layouts/sidebar-painel"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"

export interface PainelLayoutShellProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  tenantName?: string | null
}

export function PainelLayoutShell({
  children,
  userName,
  userEmail,
  tenantName,
}: PainelLayoutShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden h-full lg:block">
        <SidebarPainel
          tenantName={tenantName ?? undefined}
          userEmail={userEmail}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          mobileNav={
            <SidebarPainel
              tenantName={tenantName ?? undefined}
              userEmail={userEmail}
            />
          }
          userName={userName}
          profileHref="/painel/configuracoes"
        />
        <main className="flex-1 overflow-y-auto bg-[var(--color-pmb-mist)] p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
