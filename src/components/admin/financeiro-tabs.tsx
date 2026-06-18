"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminFinanceClient } from "./admin-finance-client"
import { FinanceiroTenantPayments } from "./financeiro-tenant-payments"
import { FinanceiroReferralPayouts } from "./financeiro-referral-payouts"

const ALL_TABS = [
  { id: "overview", label: "Visão geral", superOnly: true },
  { id: "tenant-payments", label: "Mensalidades a receber", superOnly: true },
  { id: "referral-payouts", label: "Comissões a pagar", superOnly: false },
] as const

type TabId = (typeof ALL_TABS)[number]["id"]

interface FinanceiroTabsProps {
  canMarkPaid: boolean
  /**
   * SUPER_ADMIN vê visão geral + mensalidades a receber (APIs super-only). Os
   * demais papéis (PMB_SALES, PMB_RESELLER_MGR) só enxergam comissões a pagar,
   * já escopadas na rota — sem isso as outras abas retornariam 403.
   */
  canSeeAll?: boolean
}

export function FinanceiroTabs({
  canMarkPaid,
  canSeeAll = true,
}: FinanceiroTabsProps) {
  const tabs = canSeeAll ? ALL_TABS : ALL_TABS.filter((t) => !t.superOnly)
  const [active, setActive] = useState<TabId>(tabs[0].id)

  return (
    <Tabs
      value={active}
      onValueChange={(v) => setActive(v as TabId)}
      className="gap-6"
    >
      <TabsList className="bg-white ring-1 ring-gray-200 shadow-sm">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {canSeeAll && (
        <TabsContent value="overview">
          <AdminFinanceClient />
        </TabsContent>
      )}
      {canSeeAll && (
        <TabsContent value="tenant-payments">
          <FinanceiroTenantPayments canMarkPaid={canMarkPaid} />
        </TabsContent>
      )}
      <TabsContent value="referral-payouts">
        <FinanceiroReferralPayouts canMarkPaid={canMarkPaid} />
      </TabsContent>
    </Tabs>
  )
}
