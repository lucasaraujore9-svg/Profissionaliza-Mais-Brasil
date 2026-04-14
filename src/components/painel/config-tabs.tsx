"use client"

import { useState } from "react"
import { AccountForm } from "./account-form"
import { BillingSection } from "./billing-section"
import { SecurityForm } from "./security-form"

const tabs = [
  { id: "conta", label: "Conta" },
  { id: "pagamento", label: "Pagamento" },
  { id: "seguranca", label: "Segurança" },
] as const

type TabId = (typeof tabs)[number]["id"]

export function ConfigTabs() {
  const [active, setActive] = useState<TabId>("conta")

  return (
    <div>
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active === tab.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:text-[#1A1A2E]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {active === "conta" && <AccountForm />}
        {active === "pagamento" && <BillingSection />}
        {active === "seguranca" && <SecurityForm />}
      </div>
    </div>
  )
}
