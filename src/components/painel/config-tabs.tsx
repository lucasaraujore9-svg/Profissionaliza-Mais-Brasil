"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccountForm } from "./account-form"
import { BillingSection } from "./billing-section"
import { SecurityForm } from "./security-form"
import { PixForm } from "./pix-form"
import { TrackingForm } from "./tracking-form"
import type { ConfigData, ConfigDataWithTenant } from "./config-tabs.types"

const ALL_TABS = [
  // "conta" e "segurança" são auto-serviço — todo membro precisa editar os
  // próprios dados e trocar a própria senha. As demais são configuração da
  // UNIDADE e só aparecem para quem a administra.
  { id: "conta", label: "Conta", unitOnly: false },
  { id: "pagamento", label: "Pagamento", unitOnly: true },
  { id: "pix", label: "PIX (comissões)", unitOnly: true },
  { id: "rastreamento", label: "Rastreamento", unitOnly: true },
  { id: "seguranca", label: "Segurança", unitOnly: false },
] as const

type TabId = (typeof ALL_TABS)[number]["id"]

export function ConfigTabs() {
  const router = useRouter()
  const params = useSearchParams()
  const urlTab = params.get("tab") as TabId | null
  const [data, setData] = useState<ConfigData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Abas visíveis dependem do que a API devolveu: sem `canManageUnit` o bloco
  // `tenant` nem chega ao client, então renderizar "Pagamento" quebraria.
  const tabs = ALL_TABS.filter((t) => !t.unitOnly || data?.canManageUnit)
  const active: TabId = tabs.some((t) => t.id === urlTab)
    ? (urlTab as TabId)
    : "conta"

  const setActive = useCallback(
    (id: TabId) => {
      const next = new URLSearchParams(params)
      next.set("tab", id)
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [params, router],
  )

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
        ...prev,
        user: { ...prev.user, ...(next.user ?? {}) },
        // `tenant` é null para quem não administra a unidade — nesse caso não há
        // nada a mesclar e o bloco permanece null.
        tenant:
          prev.tenant && next.tenant
            ? { ...prev.tenant, ...next.tenant }
            : (next.tenant ?? prev.tenant),
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
      <Tabs
        value={active}
        onValueChange={(v) => typeof v === "string" && setActive(v as TabId)}
      >
        <TabsList
          data-tour="config:tabs"
          className="flex w-full flex-wrap justify-start gap-1 bg-[var(--color-pmb-mist,#f7faf7)] p-1"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-tour={`config:${tab.id}`}
              className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)] data-active:shadow-sm"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-6">
        {active === "conta" && (
          <AccountForm data={data} onUpdate={handleConfigUpdate} />
        )}
        {active === "pagamento" && data.tenant && (
          <BillingSection
            data={data as ConfigDataWithTenant}
            onUpdate={handleConfigUpdate}
          />
        )}
        {active === "pix" && <PixForm />}
        {active === "rastreamento" && <TrackingForm />}
        {active === "seguranca" && <SecurityForm />}
      </div>
    </div>
  )
}
