"use client"

import { useState } from "react"
import { CheckCircle2, Save } from "lucide-react"
import {
  IntegrationTestCards,
  type IntegrationsConfig,
} from "./integration-test-cards"
import { WebhookConfig, type WebhookConfigData } from "./webhook-config"
import { SystemInfo, type SystemInfoData } from "./system-info"
import { PmbMpTokenConfig } from "./pmb-mp-token-config"
import { ApiDocsTab } from "./api-docs-tab"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "integracoes", label: "Integrações" },
  { id: "webhooks", label: "Webhooks" },
  { id: "api", label: "API" },
  { id: "sobre", label: "Sobre" },
] as const

type TabId = (typeof TABS)[number]["id"]

export type PaymentGatewayId = "MP" | "ASAAS"

export interface GeneralConfigData {
  appName: string
  appDomain: string
  supportEmail: string
  pmbDirectSaleGateway: PaymentGatewayId
  pmbInterestFreeInstallments: number
}

interface GeneralTabProps {
  general: GeneralConfigData
  canEditGateway: boolean
  asaasAvailable: boolean
  mpAvailable: boolean
}

function GeneralTab({
  general,
  canEditGateway,
  asaasAvailable,
  mpAvailable,
}: GeneralTabProps) {
  const [gateway, setGateway] = useState<PaymentGatewayId>(
    general.pmbDirectSaleGateway,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const dirty = gateway !== general.pmbDirectSaleGateway

  const [interestFree, setInterestFree] = useState(
    general.pmbInterestFreeInstallments,
  )
  const [ifSaving, setIfSaving] = useState(false)
  const [ifError, setIfError] = useState<string | null>(null)
  const [ifOk, setIfOk] = useState(false)

  async function saveInterestFree(next: number) {
    setInterestFree(next)
    setIfSaving(true)
    setIfError(null)
    setIfOk(false)
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmbInterestFreeInstallments: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        setIfError(body.error ?? "Falha ao salvar")
        return
      }
      setIfOk(true)
      setTimeout(() => setIfOk(false), 2000)
    } catch {
      setIfError("Erro de rede ao salvar")
    } finally {
      setIfSaving(false)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmbDirectSaleGateway: gateway }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar gateway")
        return
      }
      setOk(true)
    } catch {
      setError("Erro de rede ao salvar gateway")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Configurações gerais
        </h3>
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

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Vendas diretas — gateway de pagamento
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Define qual processador de pagamento será usado nas vendas feitas diretamente
          pela vitrine principal e pelo painel administrativo.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canEditGateway || !mpAvailable}
            onClick={() => setGateway("MP")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              gateway === "MP"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Mercado Pago
              </span>
              {gateway === "MP" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Checkout transparente com cartão, Pix e boleto. Recomendado para volume alto.
            </p>
            {!mpAvailable && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700">
                Token PMB não configurado
              </p>
            )}
          </button>

          <button
            type="button"
            disabled={!canEditGateway || !asaasAvailable}
            onClick={() => setGateway("ASAAS")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              gateway === "ASAAS"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Asaas
              </span>
              {gateway === "ASAAS" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Cobrança via boleto, Pix ou cartão usando a mesma conta corporativa PMB.
            </p>
            {!asaasAvailable && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700">
                Asaas não configurado nas variáveis de ambiente
              </p>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        {ok && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Gateway atualizado com sucesso.
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            {canEditGateway
              ? "Apenas o SUPER_ADMIN pode alterar este parâmetro."
              : "Somente SUPER_ADMIN pode alterar este parâmetro."}
          </p>
          {canEditGateway && (
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar gateway"}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Vendas diretas — parcelamento sem juros
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Nas vendas diretas da PMB (vitrine PMB), o aluno parcela no cartão em
          até <strong>12x</strong>. Defina em quantas dessas parcelas a PMB
          assume o juros (sem juros para o aluno). O valor exibido no checkout é
          sempre o confirmado pelo Mercado Pago.
        </p>

        <div className="mt-5 max-w-xs">
          <Label htmlFor="pmb-interest-free">Parcelas sem juros</Label>
          <select
            id="pmb-interest-free"
            value={interestFree}
            disabled={!canEditGateway || ifSaving}
            onChange={(e) => saveInterestFree(Number(e.target.value))}
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-60"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1
                  ? "Apenas à vista (sem parcelas sem juros)"
                  : `Até ${n}x sem juros`}
              </option>
            ))}
          </select>
        </div>

        {ifError && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {ifError}
          </p>
        )}
        {ifOk && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Parcelamento atualizado.
          </p>
        )}
        {!canEditGateway && (
          <p className="mt-3 text-[11px] text-gray-500">
            Somente SUPER_ADMIN pode alterar este parâmetro.
          </p>
        )}
      </div>
    </div>
  )
}

interface AdminConfigTabsProps {
  general: GeneralConfigData
  integrations: IntegrationsConfig
  webhooks: WebhookConfigData
  system: SystemInfoData
  canEditGateway: boolean
  pmbWebhookSecret: string | null
}

export function AdminConfigTabs({
  general,
  integrations,
  webhooks,
  system,
  canEditGateway,
  pmbWebhookSecret,
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
                ? "bg-[var(--color-pmb-green)] text-white shadow-sm"
                : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {active === "geral" && (
          <GeneralTab
            general={general}
            canEditGateway={canEditGateway}
            asaasAvailable={integrations.asaas.configured}
            mpAvailable={integrations.mp.configured}
          />
        )}
        {active === "integracoes" && (
          <div className="space-y-6">
            <PmbMpTokenConfig
              configured={integrations.mp.configured}
              tokenSource={integrations.mp.tokenSource ?? null}
              canEdit={canEditGateway}
            />
            <IntegrationTestCards integrations={integrations} />
          </div>
        )}
        {active === "webhooks" && <WebhookConfig config={webhooks} />}
        {active === "api" && <ApiDocsTab pmbWebhookSecret={pmbWebhookSecret} />}
        {active === "sobre" && <SystemInfo info={system} />}
      </div>
    </div>
  )
}
