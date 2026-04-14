"use client"

import { SidebarAdmin } from "@/components/shared/layouts/sidebar-admin"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA]">
      <div className="hidden lg:block">
        <SidebarAdmin />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          userName="Admin Master"
          mobileNav={<SidebarAdmin />}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
