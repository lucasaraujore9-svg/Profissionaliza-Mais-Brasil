"use client"

import { SidebarAdmin } from "@/components/shared/layouts/sidebar-admin"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"
import { useSidebarCollapsed } from "@/components/shared/layouts/use-sidebar-collapsed"
import { PermissionProvider } from "@/components/shared/permissions/permission-context"
import type { AdminPermission } from "@/lib/auth/admin-permissions"

export function AdminLayoutShell({
  children,
  permissions,
  userName,
  userEmail,
  defaultCollapsed = false,
}: {
  children: React.ReactNode
  permissions: AdminPermission[]
  userName: string
  userEmail: string
  defaultCollapsed?: boolean
}) {
  const { collapsed, toggle } = useSidebarCollapsed(defaultCollapsed)
  return (
    <PermissionProvider permissions={permissions}>
    <div className="flex h-screen overflow-hidden bg-[var(--color-pmb-mist)]">
      <div className="hidden h-full lg:block">
        <SidebarAdmin
          permissions={permissions}
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
            <SidebarAdmin
              permissions={permissions}
              userName={userName}
              userEmail={userEmail}
            />
          }
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
    </PermissionProvider>
  )
}
