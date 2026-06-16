"use client"

import { useState } from "react"
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
    <div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active === tab.id
                ? "bg-[var(--color-pmb-green)] text-white shadow-sm"
                : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {active === "overview" && <AdminFinanceClient />}
        {active === "tenant-payments" && (
          <FinanceiroTenantPayments canMarkPaid={canMarkPaid} />
        )}
        {active === "referral-payouts" && (
          <FinanceiroReferralPayouts canMarkPaid={canMarkPaid} />
        )}
      </div>
    </div>
  )
}
