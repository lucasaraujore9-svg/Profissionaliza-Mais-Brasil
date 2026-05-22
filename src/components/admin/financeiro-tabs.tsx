"use client"

import { useState } from "react"
import { AdminFinanceClient } from "./admin-finance-client"
import { FinanceiroTenantPayments } from "./financeiro-tenant-payments"
import { FinanceiroReferralPayouts } from "./financeiro-referral-payouts"

const TABS = [
  { id: "overview", label: "Visão geral" },
  { id: "tenant-payments", label: "Mensalidades a receber" },
  { id: "referral-payouts", label: "Comissões a pagar" },
] as const

type TabId = (typeof TABS)[number]["id"]

interface FinanceiroTabsProps {
  canMarkPaid: boolean
}

export function FinanceiroTabs({ canMarkPaid }: FinanceiroTabsProps) {
  const [active, setActive] = useState<TabId>("overview")

  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
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
