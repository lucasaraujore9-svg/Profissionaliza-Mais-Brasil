"use client"

import { SidebarPainel } from "@/components/shared/layouts/sidebar-painel"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"

export function PainelLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <SidebarPainel />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard mobileNav={<SidebarPainel />} userName="João Silva" />
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA] p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
