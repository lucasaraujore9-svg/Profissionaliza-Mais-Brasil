"use client"

import { useState } from "react"
import { IntegrationTestCards } from "./integration-test-cards"
import { WebhookConfig } from "./webhook-config"
import { SystemInfo } from "./system-info"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "integracoes", label: "Integrações" },
  { id: "webhooks", label: "Webhooks" },
  { id: "sobre", label: "Sobre" },
] as const

type TabId = (typeof TABS)[number]["id"]

function GeneralTab() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Configurações gerais</h3>
      <p className="mt-1 text-xs text-gray-600">
        Dados exibidos publicamente e no rodapé das vitrines.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="conf-nome">Nome da plataforma</Label>
          <Input
            id="conf-nome"
            defaultValue="Profissionaliza Mais Brasil"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="conf-dominio">Domínio principal</Label>
          <Input
            id="conf-dominio"
            defaultValue="profissionalizamaisbrasil.com.br"
            className="mt-1.5 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="conf-suporte">E-mail de suporte</Label>
          <Input
            id="conf-suporte"
            type="email"
            defaultValue="suporte@profissionalizamaisbrasil.com.br"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="conf-telefone">Telefone de contato</Label>
          <Input
            id="conf-telefone"
            defaultValue="(11) 4000-0000"
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button className="bg-blue-600 text-white hover:bg-blue-700">
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}

export function AdminConfigTabs() {
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
        {active === "geral" && <GeneralTab />}
        {active === "integracoes" && <IntegrationTestCards />}
        {active === "webhooks" && <WebhookConfig />}
        {active === "sobre" && <SystemInfo />}
      </div>
    </div>
  )
}
