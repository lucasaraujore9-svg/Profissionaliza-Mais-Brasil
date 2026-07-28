"use client"

import { SidebarPainel } from "@/components/shared/layouts/sidebar-painel"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"
import { TourRunner } from "@/components/shared/tour/tour-runner"
import { BillingReminderPopup } from "@/components/painel/billing-reminder-popup"
import { useSidebarCollapsed } from "@/components/shared/layouts/use-sidebar-collapsed"

type MemberRole = "owner" | "consultant" | null

export interface PainelLayoutShellProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  tenantName?: string | null
  tenantLogoUrl?: string | null
  automationEnabled?: boolean
  canSellResellers?: boolean
  memberRole?: MemberRole
  /** Ids de tours guiados já dispensados por este usuário. */
  dismissedTours?: string[]
  defaultCollapsed?: boolean
}

export function PainelLayoutShell({
  children,
  userName,
  userEmail,
  tenantName,
  tenantLogoUrl,
  automationEnabled = false,
  canSellResellers = false,
  memberRole = "owner",
  dismissedTours = [],
  defaultCollapsed = false,
}: PainelLayoutShellProps) {
  const { collapsed, toggle } = useSidebarCollapsed(defaultCollapsed)
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden h-full lg:block">
        <SidebarPainel
          tenantName={tenantName ?? undefined}
          tenantLogoUrl={tenantLogoUrl ?? undefined}
          userEmail={userEmail}
          automationEnabled={automationEnabled}
          canSellResellers={canSellResellers}
          collapsed={collapsed}
          onToggleCollapse={toggle}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderDashboard
          mobileNav={
            <SidebarPainel
              tenantName={tenantName ?? undefined}
              tenantLogoUrl={tenantLogoUrl ?? undefined}
              userEmail={userEmail}
              automationEnabled={automationEnabled}
              canSellResellers={canSellResellers}
            />
          }
          userName={userName}
          profileHref="/painel/configuracoes"
          showTourHelp
        />
        <main className="flex-1 overflow-y-auto bg-[var(--color-pmb-mist)] p-4 lg:p-8">
          {children}
        </main>
      </div>
      <TourRunner
        area="painel"
        memberRole={memberRole}
        dismissed={dismissedTours}
      />
      {/* Aviso de mensalidade a vencer/vencida. Fica no shell (e não na página
          do dashboard) para pegar o primeiro carregamento do painel, qualquer
          que seja a rota de entrada. Só para o dono — a API responde 403 ao
          consultor e o componente não renderiza nada. */}
      {memberRole === "owner" && <BillingReminderPopup />}
    </div>
  )
}
