"use client"

import { SidebarPainel } from "@/components/shared/layouts/sidebar-painel"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"

export function PainelLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarPainel />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          mobileNav={<SidebarPainel />}
        />
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA] p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
