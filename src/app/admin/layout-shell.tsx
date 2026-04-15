"use client"

import { SidebarAdmin } from "@/components/shared/layouts/sidebar-admin"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"

type Role = "SUPER_ADMIN" | "PMB_SALES" | "PMB_RESELLER_MGR"

export function AdminLayoutShell({
  children,
  role,
  userName,
}: {
  children: React.ReactNode
  role: Role
  userName: string
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-pmb-mist)]">
      <div className="hidden h-full lg:block">
        <SidebarAdmin role={role} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          userName={userName}
          mobileNav={<SidebarAdmin role={role} />}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
