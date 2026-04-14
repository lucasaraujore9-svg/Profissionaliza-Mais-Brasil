"use client"

import { useState } from "react"
import {
  IntegrationTestCards,
  type IntegrationsConfig,
} from "./integration-test-cards"
import { WebhookConfig, type WebhookConfigData } from "./webhook-config"
import { SystemInfo, type SystemInfoData } from "./system-info"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "integracoes", label: "Integrações" },
  { id: "webhooks", label: "Webhooks" },
  { id: "sobre", label: "Sobre" },
] as const

type TabId = (typeof TABS)[number]["id"]

export interface GeneralConfigData {
  appName: string
  appDomain: string
  supportEmail: string
}

interface GeneralTabProps {
  general: GeneralConfigData
}

function GeneralTab({ general }: GeneralTabProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Configurações gerais</h3>
      <p className="mt-1 text-xs text-gray-600">
        Dados exibidos publicamente e no rodapé das vitrines.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="conf-nome">Nome da plataforma</Label>
          <Input id="conf-nome" defaultValue={general.appName} className="mt-1.5" readOnly />
        </div>
        <div>
          <Label htmlFor="conf-dominio">Domínio principal</Label>
          <Input
            id="conf-dominio"
            defaultValue={general.appDomain}
            className="mt-1.5 font-mono"
            readOnly
          />
        </div>
        <div>
          <Label htmlFor="conf-suporte">E-mail de suporte</Label>
          <Input
            id="conf-suporte"
            type="email"
            defaultValue={general.supportEmail}
            className="mt-1.5"
            readOnly
          />
        </div>
      </div>

      <p className="mt-5 text-[11px] text-gray-500">
        Estes valores vêm de variáveis de ambiente. Para alterá-los, edite no Vercel e
        faça redeploy.
      </p>
    </div>
  )
}

interface AdminConfigTabsProps {
  general: GeneralConfigData
  integrations: IntegrationsConfig
  webhooks: WebhookConfigData
  system: SystemInfoData
}

export function AdminConfigTabs({
  general,
  integrations,
  webhooks,
  system,
}: AdminConfigTabsProps) {
  const [active, setActive] = useState<TabId>("geral")

  return (
    <div>
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
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
        {active === "geral" && <GeneralTab general={general} />}
        {active === "integracoes" && <IntegrationTestCards integrations={integrations} />}
        {active === "webhooks" && <WebhookConfig config={webhooks} />}
        {active === "sobre" && <SystemInfo info={system} />}
      </div>
    </div>
  )
}
