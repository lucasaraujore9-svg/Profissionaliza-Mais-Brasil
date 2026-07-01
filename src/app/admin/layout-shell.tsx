"use client"

import { SidebarAdmin } from "@/components/shared/layouts/sidebar-admin"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"
import { useSidebarCollapsed } from "@/components/shared/layouts/use-sidebar-collapsed"

type Role = "SUPER_ADMIN" | "PMB_SALES" | "PMB_SALES_MGR" | "PMB_REVENDA_SALES" | "PMB_RESELLER_MGR" | "PMB_FINANCEIRO"

export function AdminLayoutShell({
  children,
  role,
  userName,
  userEmail,
  defaultCollapsed = false,
}: {
  children: React.ReactNode
  role: Role
  userName: string
  userEmail: string
  defaultCollapsed?: boolean
}) {
  const { collapsed, toggle } = useSidebarCollapsed(defaultCollapsed)
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-pmb-mist)]">
      <div className="hidden h-full lg:block">
        <SidebarAdmin
          role={role}
          userName={userName}
          userEmail={userEmail}
          collapsed={collapsed}
          onToggleCollapse={toggle}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          userName={userName}
          profileHref="/admin/meu-perfil"
          mobileNav={
            <SidebarAdmin role={role} userName={userName} userEmail={userEmail} />
          }
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
