"use client"

import { useState } from "react"
import { Send, Settings, Smartphone } from "lucide-react"
import { AdminBroadcastForm } from "./admin-broadcast-form"
import { AutoConfigPanel } from "./auto-config-panel"
import { PushDevicePanel } from "@/components/shared/push-device-panel"

type Tab = "device" | "manual" | "auto"

export function ComunicacaoAdminClient() {
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
          label="Enviar push manual"
        />
        <TabButton
          active={tab === "auto"}
          onClick={() => setTab("auto")}
          icon={Settings}
          label="Push automáticos"
        />
      </div>

      {tab === "device" && <PushDevicePanel />}

      {tab === "manual" && <AdminBroadcastForm />}

      {tab === "auto" && (
        <div className="space-y-6">
          <AutoConfigPanel
            target="TENANT"
            title="Push automáticos para Unidades"
            description="Eventos que disparam push para revendedores. Desligar aqui silencia globalmente o push e o feed in-app."
          />
          <AutoConfigPanel
            target="STUDENT"
            title="Push automáticos para Alunos"
            description="Push que vai para o app do aluno (vitrine PMB e vitrines das unidades)."
          />
          <AutoConfigPanel
            target="ADMIN"
            title="Push automáticos para a equipe PMB"
            description="Alertas em push para Admin Master, Vendas e Gerentes."
          />
        </div>
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
