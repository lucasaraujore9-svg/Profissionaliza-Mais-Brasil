"use client"

import { useState } from "react"
import { CheckCircle2, LinkIcon, Loader2, Unplug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigData } from "./config-tabs"

interface BillingSectionProps {
  data: ConfigData
  onUpdate: (next: Partial<ConfigData>) => void
}

export function BillingSection({ data, onUpdate }: BillingSectionProps) {
  const [billingMode, setBillingMode] = useState(data.tenant.billingMode)
  const [billingSaving, setBillingSaving] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const [monthlyEnabled, setMonthlyEnabled] = useState(data.tenant.monthlyEnabled)
  const [monthlySaving, setMonthlySaving] = useState(false)
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  const [connected, setConnected] = useState(data.tenant.mpConnected)
  const [tokenInput, setTokenInput] = useState("")
  const [mpSaving, setMpSaving] = useState(false)
  const [mpError, setMpError] = useState<string | null>(null)
  const [mpSuccess, setMpSuccess] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function updateBillingMode(mode: "AUTO" | "MANUAL") {
    if (mode === billingMode) return
    setBillingSaving(true)
    setBillingError(null)
    try {
      const response = await fetch("/api/painel/config/billing-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setBillingError(json?.error ?? "Erro ao salvar")
        return
      }
      setBillingMode(mode)
      onUpdate({ tenant: { ...data.tenant, billingMode: mode } })
    } catch {
      setBillingError("Erro de rede")
    } finally {
      setBillingSaving(false)
    }
  }

  async function toggleMonthly(next: boolean) {
    setMonthlySaving(true)
    setMonthlyError(null)
    try {
      const response = await fetch("/api/painel/config/mensalidade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        setMonthlyError(json?.error ?? "Erro ao salvar")
        return
      }
      setMonthlyEnabled(next)
      onUpdate({ tenant: { ...data.tenant, monthlyEnabled: next } })
    } catch {
      setMonthlyError("Erro de rede")
    } finally {
      setMonthlySaving(false)
    }
  }

  async function connectMp() {
    setMpError(null)
    setMpSuccess(null)
    if (tokenInput.trim().length < 10) {
      setMpError("Token inválido")
      return
    }
    setMpSaving(true)
    try {
      const response = await fetch("/api/painel/config/connect-mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: tokenInput.trim() }),
      })
      const json = await response.json()
      if (!response.ok) {
        setMpError(json?.error ?? "Erro ao conectar")
        return
      }
      setConnected(true)
      setTokenInput("")
      setShowForm(false)
      setMpSuccess("Gateway de pagamento conectado com sucesso.")
      onUpdate({ tenant: { ...data.tenant, mpConnected: true } })
    } catch {
      setMpError("Erro de rede")
    } finally {
      setMpSaving(false)
    }
  }

  async function disconnectMp() {
    setMpSaving(true)
    setMpError(null)
    setMpSuccess(null)
    try {
      const response = await fetch("/api/painel/config/connect-mp", {
        method: "DELETE",
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setMpError(json?.error ?? "Erro ao desconectar")
        return
      }
      setConnected(false)
      onUpdate({ tenant: { ...data.tenant, mpConnected: false } })
    } catch {
      setMpError("Erro de rede")
    } finally {
      setMpSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Modo de cobrança inadimplentes
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Escolha como lidar com alunos que atrasarem pagamentos recorrentes.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={billingSaving}
            onClick={() => updateBillingMode("AUTO")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
              billingMode === "AUTO"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Automático
              </span>
              {billingMode === "AUTO" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Alunos inadimplentes têm o acesso bloqueado automaticamente
              após 3 dias de atraso.
            </p>
          </button>
          <button
            type="button"
            disabled={billingSaving}
            onClick={() => updateBillingMode("MANUAL")}
            className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
              billingMode === "MANUAL"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Manual
              </span>
              {billingMode === "MANUAL" && (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Você recebe notificação e decide quando bloquear cada aluno.
            </p>
          </button>
        </div>

        {billingError && (
          <p className="mt-3 text-xs text-red-600">{billingError}</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Pagamento parcelado (mensalidade)
          </h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              data.tenant.monthlyAllowed
                ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {data.tenant.monthlyAllowed ? "Liberado" : "Indisponível"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Quando ativado, você pode marcar cursos como mensalidade em
          Catálogo → Editar curso. O alcance do parcelado é definido pela PMB:{" "}
          <strong className="text-[var(--color-pmb-green-900)]">
            {data.tenant.monthlyScope === "DIRECT_AND_VITRINE"
              ? "vendas diretas e vitrine"
              : "apenas vendas diretas"}
          </strong>
          .
        </p>

        {data.tenant.monthlyAllowed ? (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
            <input
              type="checkbox"
              checked={monthlyEnabled}
              disabled={monthlySaving}
              onChange={(e) => toggleMonthly(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Habilitar pagamento parcelado nos meus cursos
              </p>
              <p className="text-xs text-gray-500">
                Cursos já marcados como mensalidade voltam a ser cobrados à vista
                se você desativar.
              </p>
            </div>
            {monthlySaving && (
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-gray-400" />
            )}
          </label>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
            O pagamento parcelado ainda não foi liberado para sua unidade. Fale
            com seu gerente PMB para habilitar.
          </div>
        )}

        {monthlyError && (
          <p className="mt-3 text-xs text-red-600">{monthlyError}</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#009EE3] text-white">
              MP
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Gateway de Pagamento
              </h3>
              <p className="mt-1 text-xs text-gray-600">
                Integração responsável por receber pagamentos dos seus alunos.
              </p>
              {connected ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                  Conectado
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
            <Button
              variant="outline"
              onClick={disconnectMp}
              disabled={mpSaving}
            >
              {mpSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          ) : (
            <Button
              onClick={() => setShowForm((v) => !v)}
              className="bg-[#009EE3] text-white hover:bg-[#008cc8]"
            >
              <LinkIcon className="mr-2 h-4 w-4" />
              Conectar gateway de pagamento
            </Button>
          )}
        </div>

        {!connected && showForm && (
          <div className="mt-5 space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
            <div>
              <Label htmlFor="mp-token">Access Token MP</Label>
              <Input
                id="mp-token"
                type="password"
                className="mt-1.5 font-mono"
                placeholder="APP_USR-..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Copie no painel de pagamentos → Credenciais → Produção. O token é
                criptografado antes de ser salvo.
              </p>
            </div>
            {mpError && <p className="text-xs text-red-600">{mpError}</p>}
            <div className="flex justify-end">
              <Button
                onClick={connectMp}
                disabled={mpSaving}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {mpSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar token"
                )}
              </Button>
            </div>
          </div>
        )}

        {mpSuccess && (
          <p className="mt-3 text-xs text-green-700">{mpSuccess}</p>
        )}
        {connected && mpError && (
          <p className="mt-3 text-xs text-red-600">{mpError}</p>
        )}
      </div>
    </div>
  )
}
