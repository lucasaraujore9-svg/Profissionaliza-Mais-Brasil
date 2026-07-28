"use client"

import { useState } from "react"
import { Check, CheckCircle2, Copy, LinkIcon, Loader2, Unplug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigDataWithTenant } from "./config-tabs.types"

/**
 * Conexao da conta Asaas PROPRIA da unidade (gateway de vendas) — espelha o
 * card do Mercado Pago em billing-section.tsx. So e renderizado quando o Admin
 * Master liberou `asaasGatewayEnabled` para a unidade. A unidade cola a API key
 * da conta Asaas dela e o token de auth do webhook (que ela configura no painel
 * Asaas, apontando para a URL exibida aqui). Ambos sao criptografados no servidor.
 */
interface AsaasGatewaySectionProps {
  data: ConfigDataWithTenant
  onUpdate: (next: Partial<ConfigDataWithTenant>) => void
}

export function AsaasGatewaySection({ data, onUpdate }: AsaasGatewaySectionProps) {
  const [connected, setConnected] = useState(data.tenant.asaasConnected)
  const [webhookConfigured, setWebhookConfigured] = useState(
    data.tenant.asaasWebhookConfigured,
  )
  const [salesGateway, setSalesGateway] = useState(data.tenant.salesGateway)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [tokenInput, setTokenInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [gatewaySaving, setGatewaySaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(data.tenant.asaasWebhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Não foi possível copiar. Selecione e copie manualmente.")
    }
  }

  async function connectAsaas() {
    setError(null)
    setSuccess(null)
    if (apiKeyInput.trim().length < 10) {
      setError("API key inválida")
      return
    }
    const token = tokenInput.trim()
    if (token && token.length < 8) {
      setError("Token do webhook inválido (muito curto)")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/painel/config/connect-asaas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          ...(token ? { webhookToken: token } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? "Erro ao conectar")
        return
      }
      setConnected(true)
      setWebhookConfigured(Boolean(token))
      setApiKeyInput("")
      setTokenInput("")
      setShowForm(false)
      setSuccess(
        token
          ? "Asaas conectado com sucesso."
          : "API key conectada. Cadastre o token do webhook para liberar as vendas.",
      )
      onUpdate({
        tenant: {
          ...data.tenant,
          asaasConnected: true,
          asaasWebhookConfigured: Boolean(token),
        },
      })
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  // Atualiza apenas o token do webhook de quem ja conectou a API key.
  async function saveToken() {
    setError(null)
    setSuccess(null)
    const token = tokenInput.trim()
    if (token.length < 8) {
      setError("Token do webhook inválido (muito curto)")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/painel/config/connect-asaas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookToken: token }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? "Erro ao salvar")
        return
      }
      setWebhookConfigured(true)
      setTokenInput("")
      setSuccess("Token do webhook cadastrado. Vendas liberadas.")
      onUpdate({ tenant: { ...data.tenant, asaasWebhookConfigured: true } })
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  async function disconnectAsaas() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/painel/config/connect-asaas", {
        method: "DELETE",
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setError(json?.error ?? "Erro ao desconectar")
        return
      }
      setConnected(false)
      setWebhookConfigured(false)
      setSalesGateway("MP")
      onUpdate({
        tenant: {
          ...data.tenant,
          asaasConnected: false,
          asaasWebhookConfigured: false,
          salesGateway: "MP",
        },
      })
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  async function selectGateway(gateway: "MP" | "ASAAS") {
    if (gateway === salesGateway) return
    setGatewaySaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/painel/config/sales-gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? "Erro ao trocar gateway")
        return
      }
      setSalesGateway(gateway)
      setSuccess(
        gateway === "ASAAS"
          ? "Asaas é agora o gateway ativo das suas vendas."
          : "Mercado Pago é agora o gateway ativo das suas vendas.",
      )
      onUpdate({ tenant: { ...data.tenant, salesGateway: gateway } })
    } catch {
      setError("Erro de rede")
    } finally {
      setGatewaySaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Seletor de gateway ativo */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Gateway ativo das vendas
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Escolha por qual gateway os pagamentos dos seus alunos são
          processados. Uma venda por vez vai por um gateway.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={gatewaySaving}
            onClick={() => selectGateway("MP")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
              salesGateway === "MP"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Mercado Pago
              </span>
              {salesGateway === "MP" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Recebe via sua conta Mercado Pago.
            </p>
          </button>
          <button
            type="button"
            disabled={gatewaySaving || !connected || !webhookConfigured}
            onClick={() => selectGateway("ASAAS")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              salesGateway === "ASAAS"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Asaas
              </span>
              {salesGateway === "ASAAS" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {connected && webhookConfigured
                ? "Recebe via sua conta Asaas."
                : "Conecte sua conta Asaas abaixo para ativar."}
            </p>
          </button>
        </div>
        {gatewaySaving && (
          <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
          </p>
        )}
      </div>

      {/* Card de conexao Asaas */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1768FF] text-[10px] font-bold text-white">
              Asaas
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Conta Asaas (gateway de pagamento)
              </h3>
              <p className="mt-1 text-xs text-gray-600">
                Receba os pagamentos dos seus alunos pela sua própria conta
                Asaas (PIX, cartão e boleto no próprio site).
              </p>
              {connected && webhookConfigured ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                  Conectado
                </span>
              ) : connected ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Conectado · falta token do webhook
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                  Não conectado
                </span>
              )}
            </div>
          </div>

          {connected ? (
            <Button variant="outline" onClick={disconnectAsaas} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          ) : (
            <Button
              onClick={() => setShowForm((v) => !v)}
              className="bg-[#1768FF] text-white hover:bg-[#0f53d6]"
            >
              <LinkIcon className="mr-2 h-4 w-4" />
              Conectar conta Asaas
            </Button>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <Label>URL de notificação (webhook)</Label>
          <p className="mt-1 text-[11px] text-gray-500">
            No painel do Asaas → <strong>Integrações</strong> →{" "}
            <strong>Webhooks</strong>: crie um webhook apontando para esta URL,
            defina um <strong>token de autenticação</strong> e cole o mesmo token
            no campo abaixo. É ele que confirma as vendas automaticamente.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] text-gray-700">
              {data.tenant.asaasWebhookUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyWebhookUrl}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </>
              )}
            </Button>
          </div>
        </div>

        {!connected && showForm && (
          <div className="mt-5 space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
            <div>
              <Label htmlFor="asaas-key">API key do Asaas</Label>
              <Input
                id="asaas-key"
                type="password"
                className="mt-1.5 font-mono"
                placeholder="$aact_..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Painel Asaas → <strong>Integrações</strong> →{" "}
                <strong>Chave de API</strong> (produção). É criptografada antes
                de ser salva.
              </p>
            </div>
            <div>
              <Label htmlFor="asaas-token">Token do webhook</Label>
              <Input
                id="asaas-token"
                type="password"
                className="mt-1.5 font-mono"
                placeholder="token definido por você no webhook do Asaas"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                O mesmo token de autenticação que você definiu no webhook do
                Asaas (acima). Sem ele as vendas não são confirmadas
                automaticamente.
              </p>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end">
              <Button
                onClick={connectAsaas}
                disabled={saving}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar credenciais"
                )}
              </Button>
            </div>
          </div>
        )}

        {connected && !webhookConfigured && (
          <div className="mt-5 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800">
              Falta o token do webhook do Asaas
            </p>
            <p className="text-[11px] text-amber-700">
              A API key está conectada, mas sem o token do webhook o Asaas não
              confirma as vendas — alunos pagam e não são matriculados
              automaticamente. Cadastre o token para liberar.
            </p>
            <div>
              <Label htmlFor="asaas-token-only">Token do webhook</Label>
              <Input
                id="asaas-token-only"
                type="password"
                className="mt-1.5 font-mono"
                placeholder="token do webhook do Asaas"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={saveToken}
                disabled={saving}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar token do webhook"
                )}
              </Button>
            </div>
          </div>
        )}

        {success && <p className="mt-3 text-xs text-green-700">{success}</p>}
        {connected && error && (
          <p className="mt-3 text-xs text-red-600">{error}</p>
        )}
      </div>
    </div>
  )
}
