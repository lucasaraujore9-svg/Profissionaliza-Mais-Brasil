"use client"

import { SidebarPainel } from "@/components/shared/layouts/sidebar-painel"
import { HeaderDashboard } from "@/components/shared/layouts/header-dashboard"
import { TourRunner } from "@/components/shared/tour/tour-runner"
import { BillingReminderPopup } from "@/components/painel/billing-reminder-popup"
import { useSidebarCollapsed } from "@/components/shared/layouts/use-sidebar-collapsed"
import { PermissionProvider } from "@/components/shared/permissions/permission-context"
import type {
  PainelMemberRole,
  PainelPermission,
} from "@/lib/auth/painel-permissions"

// Espelha `session.user.memberRole` (src/types/index.ts). Derivar do catálogo de
// papéis em vez de reescrever a união aqui: quando um papel novo entra em
// `PAINEL_MEMBER_ROLES`, este shell acompanha sem virar um segundo lugar da
// verdade que sai de sincronia.
type MemberRole = PainelMemberRole | null

export interface PainelLayoutShellProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  tenantName?: string | null
  tenantLogoUrl?: string | null
  automationEnabled?: boolean
  canSellResellers?: boolean
  memberRole?: MemberRole
  /**
   * Permissões efetivas, resolvidas server-side em `layout.tsx`. Obrigatória:
   * é o que decide quais itens do menu aparecem.
   */
  permissions: PainelPermission[]
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
  permissions,
  dismissedTours = [],
  defaultCollapsed = false,
}: PainelLayoutShellProps) {
  const { collapsed, toggle } = useSidebarCollapsed(defaultCollapsed)
  return (
    <PermissionProvider permissions={permissions}>
    <div className="flex h-screen overflow-hidden">
      <div className="hidden h-full lg:block">
        <SidebarPainel
          tenantName={tenantName ?? undefined}
          tenantLogoUrl={tenantLogoUrl ?? undefined}
          userEmail={userEmail}
          permissions={permissions}
          memberRole={memberRole ?? undefined}
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
              permissions={permissions}
              memberRole={memberRole ?? undefined}
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
          que seja a rota de entrada. Gated pela mesma permissão da tela
          /painel/cobrancas — a API também responde 403 a quem não a tem. */}
      {permissions.includes("cobrancas.view") && <BillingReminderPopup />}
    </div>
    </PermissionProvider>
  )
}
