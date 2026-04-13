"use client"

import { SidebarAdmin } from "@/components/shared/layouts/sidebar-admin"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarAdmin />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          mobileNav={<SidebarAdmin />}
        />
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA] p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
