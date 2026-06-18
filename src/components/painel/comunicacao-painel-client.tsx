"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Send, Settings, Smartphone } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResellerBroadcastForm } from "./reseller-broadcast-form"
import { AutoConfigPanel } from "@/components/admin/auto-config-panel"
import { PushDevicePanel } from "@/components/shared/push-device-panel"

type Tab = "device" | "manual" | "auto"

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "device", label: "Meu dispositivo", icon: Smartphone },
  { value: "manual", label: "Enviar push para alunos", icon: Send },
  { value: "auto", label: "Push automáticos", icon: Settings },
]

export function ComunicacaoPainelClient() {
  const router = useRouter()
  const params = useSearchParams()
  const urlTab = params.get("tab") as Tab | null
  const tab: Tab = TABS.some((t) => t.value === urlTab) ? (urlTab as Tab) : "device"

  const setTab = useCallback(
    (value: string | number | null) => {
      if (typeof value !== "string") return
      const next = new URLSearchParams(params)
      next.set("tab", value)
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [params, router],
  )

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-[var(--color-pmb-mist,#f7faf7)] p-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="gap-2 data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)] data-active:shadow-sm"
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "device" && <PushDevicePanel />}

      {tab === "manual" && <ResellerBroadcastForm />}

      {tab === "auto" && (
        <AutoConfigPanel
          target="STUDENT"
          fetchUrl="/api/painel/comunicacao/auto-config"
          patchUrl="/api/painel/comunicacao/auto-config"
          patchWithoutTarget
          title="O que dispara push automático para seus alunos"
          description="Desligue categorias para silenciar apenas os seus alunos. Reativar volta ao padrão da plataforma. Quando o Admin Master desliga algo globalmente, fica trancado."
        />
      )}
    </div>
  )
}
