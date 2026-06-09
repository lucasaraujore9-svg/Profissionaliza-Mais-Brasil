"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AccountForm } from "./account-form"
import { BillingSection } from "./billing-section"
import { SecurityForm } from "./security-form"
import { PixForm } from "./pix-form"
import { TrackingForm } from "./tracking-form"

const tabs = [
  { id: "conta", label: "Conta" },
  { id: "pagamento", label: "Pagamento" },
  { id: "pix", label: "PIX (comissões)" },
  { id: "rastreamento", label: "Rastreamento" },
  { id: "seguranca", label: "Segurança" },
] as const

type TabId = (typeof tabs)[number]["id"]

export interface ConfigData {
  user: { id: string; name: string; email: string }
  tenant: {
    id: string
    name: string
    slug: string
    billingMode: "AUTO" | "MANUAL"
    status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED"
    mpConnected: boolean
    mpWebhookConfigured: boolean
    mpPublicKeyConfigured: boolean
    mpWebhookUrl: string
    mpUserId: string | null
    monthlyAllowed: boolean
    monthlyEnabled: boolean
    monthlyScope: "DIRECT_ONLY" | "DIRECT_AND_VITRINE"
  }
}

export function ConfigTabs() {
  const [active, setActive] = useState<TabId>("conta")
  const [data, setData] = useState<ConfigData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/painel/config")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar")
        return json.data as ConfigData
      })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Erro ao carregar")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleConfigUpdate = (next: Partial<ConfigData>) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        user: { ...prev.user, ...(next.user ?? {}) },
        tenant: { ...prev.tenant, ...(next.tenant ?? {}) },
      }
    })
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando configurações...
      </div>
    )
  }

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
                ? "bg-[var(--color-pmb-green)] text-white shadow-sm"
                : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {active === "conta" && (
          <AccountForm data={data} onUpdate={handleConfigUpdate} />
        )}
        {active === "pagamento" && (
          <BillingSection data={data} onUpdate={handleConfigUpdate} />
        )}
        {active === "pix" && <PixForm />}
        {active === "rastreamento" && <TrackingForm />}
        {active === "seguranca" && <SecurityForm />}
      </div>
    </div>
  )
}
