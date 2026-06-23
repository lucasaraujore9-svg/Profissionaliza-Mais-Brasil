"use client"

import { SidebarPainel } from "@/components/shared/layouts/sidebar-painel"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"
import { OnboardingTour } from "@/components/painel/onboarding-tour"

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
  tourCompleted?: boolean
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
  tourCompleted = false,
}: PainelLayoutShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden h-full lg:block">
        <SidebarPainel
          tenantName={tenantName ?? undefined}
          tenantLogoUrl={tenantLogoUrl ?? undefined}
          userEmail={userEmail}
          automationEnabled={automationEnabled}
          canSellResellers={canSellResellers}
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
      <OnboardingTour memberRole={memberRole} completed={tourCompleted} />
    </div>
  )
}
