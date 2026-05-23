"use client"

import { useState } from "react"
import { Send, Settings, Smartphone } from "lucide-react"
import { ResellerBroadcastForm } from "./reseller-broadcast-form"
import { AutoConfigPanel } from "@/components/admin/auto-config-panel"
import { PushDevicePanel } from "@/components/shared/push-device-panel"

type Tab = "device" | "manual" | "auto"

export function ComunicacaoPainelClient() {
  const [tab, setTab] = useState<Tab>("device")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <TabButton
          active={tab === "device"}
          onClick={() => setTab("device")}
          icon={Smartphone}
          label="Meu dispositivo"
        />
        <TabButton
          active={tab === "manual"}
          onClick={() => setTab("manual")}
          icon={Send}
          label="Enviar push para alunos"
        />
        <TabButton
          active={tab === "auto"}
          onClick={() => setTab("auto")}
          icon={Settings}
          label="Push automáticos"
        />
      </div>

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

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-[var(--color-pmb-green)] text-white shadow-sm"
          : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
