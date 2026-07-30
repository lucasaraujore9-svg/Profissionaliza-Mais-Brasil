"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  LinkIcon,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigDataWithTenant } from "./config-tabs.types"

/**
 * Conexao da conta Asaas PROPRIA da unidade (gateway de vendas) — espelha o
 * card do Mercado Pago em billing-section.tsx. Aparece para TODA unidade: o
 * Asaas deixou de ser capability liberada caso a caso pelo Admin Master, e as
 * duas opcoes de gateway ficam sempre disponiveis.
 *
 * A unidade cola SO a API key. O webhook (que e quem confirma as vendas) e
 * registrado por nos na conta dela via API, com token forte gerado aqui — antes
 * dependia de a unidade criar a mao no painel do Asaas e, na pratica, nenhuma
 * conta de revenda chegou a notificar: aluno pagava e a matricula ficava
 * pendente. O cadastro manual continua disponivel como saida de emergencia.
 */
interface AsaasGatewaySectionProps {
  data: ConfigDataWithTenant
  onUpdate: (next: Partial<ConfigDataWithTenant>) => void
}

interface WebhookStatus {
  configured: boolean
  healthy: boolean
  enabled: boolean
  interrupted: boolean
  penalizedRequestsCount: number
  url: string | null
  expectedUrl: string
  missingEvents: string[]
  unavailable?: { code: string; message: string }
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
  const [showManual, setShowManual] = useState(false)
  const [copied, setCopied] = useState(false)
  // Estado REAL do webhook na conta do Asaas (não "tem token salvo").
  const [status, setStatus] = useState<WebhookStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [ensuring, setEnsuring] = useState(false)

  // Prontidão do MP pela MESMA trinca que o PATCH /sales-gateway exige (token +
  // public key + assinatura secreta). Sem isso o botão do Mercado Pago ficava
  // sempre clicável: a unidade que só conectou o Asaas — caso suportado desde
  // que o Asaas passou a valer para todas — clicava e levava 400 sem entender.
  const mpReady =
    data.tenant.mpConnected &&
    data.tenant.mpPublicKeyConfigured &&
    data.tenant.mpWebhookConfigured

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch("/api/painel/config/asaas-webhook", {
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.data) setStatus(json.data as WebhookStatus)
    } catch {
      // Diagnóstico é best-effort: sem status a tela ainda oferece o botão de
      // configurar/reparar, que é o que resolve.
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected) void loadStatus()
  }, [connected, loadStatus])

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
      // O servidor é a fonte da verdade: `webhookConfigured` já considera tanto
      // o token manual quanto o gerado pelo registro automático.
      const nextWebhookConfigured = Boolean(json?.data?.webhookConfigured)
      setWebhookConfigured(nextWebhookConfigured)
      setApiKeyInput("")
      setTokenInput("")
      setShowForm(false)

      const webhook = json?.data?.webhook as
        | { ok: true; created: boolean }
        | { ok: false; message: string }
        | null
      if (webhook && !webhook.ok) {
        setError(
          `Conta conectada, mas o webhook não pôde ser registrado automaticamente: ${webhook.message}`,
        )
      } else if (webhook?.ok) {
        setSuccess(
          webhook.created
            ? "Asaas conectado e webhook criado na sua conta. As vendas passam a confirmar sozinhas."
            : "Asaas conectado e webhook conferido na sua conta.",
        )
      } else {
        setSuccess(
          nextWebhookConfigured
            ? "Asaas conectado com sucesso."
            : "API key conectada. Configure o webhook para liberar as vendas.",
        )
      }

      onUpdate({
        tenant: {
          ...data.tenant,
          asaasConnected: true,
          asaasWebhookConfigured: nextWebhookConfigured,
        },
      })
      void loadStatus()
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  /** Cria/corrige o webhook na conta do Asaas e rotaciona o token. */
  async function ensureWebhook() {
    setError(null)
    setSuccess(null)
    setEnsuring(true)
    try {
      const res = await fetch("/api/painel/config/asaas-webhook", {
        method: "POST",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? "Não foi possível configurar o webhook")
        return
      }
      setWebhookConfigured(true)
      setSuccess(
        json?.data?.created
          ? "Webhook criado na sua conta Asaas. As vendas passam a confirmar sozinhas."
          : "Webhook corrigido na sua conta Asaas.",
      )
      onUpdate({
        tenant: { ...data.tenant, asaasWebhookConfigured: true },
      })
      await loadStatus()
    } catch {
      setError("Erro de rede")
    } finally {
      setEnsuring(false)
    }
  }

  // Atualiza apenas o token do webhook de quem cadastrou o webhook a mao.
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
      void loadStatus()
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
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? "Erro ao desconectar")
        return
      }
      // O gateway ativo resultante vem do servidor: ele só volta para MP quando
      // o Mercado Pago está realmente pronto. Assumir "MP" aqui mentia para a
      // unidade que desconectou o Asaas sem ter MP configurado.
      const nextGateway: "MP" | "ASAAS" =
        json?.data?.salesGateway === "ASAAS" ? "ASAAS" : "MP"
      setConnected(false)
      setWebhookConfigured(false)
      setSalesGateway(nextGateway)
      setStatus(null)
      onUpdate({
        tenant: {
          ...data.tenant,
          asaasConnected: false,
          asaasWebhookConfigured: false,
          salesGateway: nextGateway,
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
            disabled={gatewaySaving || !mpReady}
            onClick={() => selectGateway("MP")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
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
              {mpReady
                ? "Recebe via sua conta Mercado Pago."
                : "Conecte o Mercado Pago (token, public key e assinatura) para ativar."}
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
                  Conectado · falta o webhook
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

        {/* ── Confirmação automática das vendas (webhook) ───────────────────── */}
        {connected && (
          <WebhookPanel
            status={status}
            loading={statusLoading}
            ensuring={ensuring}
            onEnsure={ensureWebhook}
            onRefresh={loadStatus}
          />
        )}

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
                de ser salva. Com ela, configuramos o webhook de confirmação
                automática na sua conta — você não precisa fazer mais nada.
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
                    Conectando...
                  </>
                ) : (
                  "Conectar"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Saída de emergência: cadastro manual ──────────────────────────── */}
        {connected && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-[11px] font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700"
            >
              {showManual
                ? "Ocultar configuração manual do webhook"
                : "Prefiro configurar o webhook manualmente"}
            </button>

            {showManual && (
              <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div>
                  <Label>URL de notificação (webhook)</Label>
                  <p className="mt-1 text-[11px] text-gray-500">
                    No painel do Asaas → <strong>Integrações</strong> →{" "}
                    <strong>Webhooks</strong>: crie um webhook para esta URL,
                    defina um <strong>token de autenticação</strong> e cole o
                    mesmo token abaixo. Use isto só se a configuração automática
                    não funcionar na sua conta.
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
                <div>
                  <Label htmlFor="asaas-token-only">Token do webhook</Label>
                  <Input
                    id="asaas-token-only"
                    type="password"
                    className="mt-1.5 font-mono"
                    placeholder="token que você definiu no webhook do Asaas"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={saveToken}
                    disabled={saving}
                    variant="outline"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar token manual"
                    )}
                  </Button>
                </div>
              </div>
            )}
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

/**
 * Estado real da confirmação automática. O que importa para a unidade não é
 * "salvei um token", é "a minha venda confirma sozinha?" — então mostramos o que
 * a conta do Asaas responde, e um botão único que resolve os casos conhecidos
 * (não existe, URL errada, desativado, fila interrompida, faltando evento).
 */
function WebhookPanel({
  status,
  loading,
  ensuring,
  onEnsure,
  onRefresh,
}: {
  status: WebhookStatus | null
  loading: boolean
  ensuring: boolean
  onEnsure: () => void
  onRefresh: () => void
}) {
  const healthy = status?.healthy === true
  const unavailable = status?.unavailable

  const problems: string[] = []
  if (status && !unavailable && !healthy) {
    if (!status.configured) {
      problems.push(
        status.url
          ? "Existe um webhook, mas apontando para o endereço errado."
          : "Nenhum webhook cadastrado nesta conta Asaas.",
      )
    }
    if (status.configured && !status.enabled) {
      problems.push("O webhook está desativado no Asaas.")
    }
    if (status.interrupted) {
      problems.push("A fila de envio está interrompida.")
    }
    if (status.penalizedRequestsCount > 0) {
      problems.push(
        `${status.penalizedRequestsCount} envio(s) penalizado(s) por falha.`,
      )
    }
    if (status.configured && status.missingEvents.length > 0) {
      problems.push(
        `Faltam eventos de pagamento: ${status.missingEvents.join(", ")}.`,
      )
    }
  }

  return (
    <div
      className={`mt-5 rounded-xl border p-4 ${
        healthy
          ? "border-green-200 bg-green-50/60"
          : unavailable
            ? "border-red-200 bg-red-50/60"
            : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {healthy ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <AlertTriangle
              className={`mt-0.5 h-4 w-4 shrink-0 ${unavailable ? "text-red-600" : "text-amber-600"}`}
            />
          )}
          <div>
            <p
              className={`text-xs font-semibold ${
                healthy
                  ? "text-green-800"
                  : unavailable
                    ? "text-red-800"
                    : "text-amber-800"
              }`}
            >
              {loading && !status
                ? "Verificando a confirmação automática…"
                : healthy
                  ? "Confirmação automática ativa"
                  : unavailable
                    ? "Não foi possível verificar a confirmação automática"
                    : "Confirmação automática inativa"}
            </p>
            <div className="mt-1 space-y-0.5 text-[11px]">
              {healthy && (
                <p className="text-green-700">
                  O Asaas avisa a plataforma assim que o aluno paga — a matrícula
                  é liberada sozinha.
                </p>
              )}
              {unavailable && (
                <p className="text-red-700">{unavailable.message}</p>
              )}
              {!healthy && !unavailable && status && (
                <>
                  <p className="text-amber-800">
                    Enquanto isso, o aluno paga e a matrícula <strong>não</strong>{" "}
                    é liberada sozinha — alguém precisa clicar em &quot;Verificar
                    pagamento&quot; na ficha dele.
                  </p>
                  {problems.map((p) => (
                    <p key={p} className="text-amber-700">
                      • {p}
                    </p>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {!healthy && (
            <Button
              type="button"
              size="sm"
              onClick={onEnsure}
              disabled={ensuring}
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              {ensuring ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Configurando…
                </>
              ) : status?.configured ? (
                "Reparar agora"
              ) : (
                "Configurar agora"
              )}
            </Button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Verificar de novo
          </button>
        </div>
      </div>
    </div>
  )
}
