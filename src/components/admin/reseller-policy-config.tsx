"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"

export type BillingMode = "AUTO" | "MANUAL"

export interface CancellationPolicy {
  gracePeriodDays?: number
  keepStudentsActive?: boolean
  notifyStudents?: boolean
}

interface ResellerPolicyConfigProps {
  tenantId: string
  billingMode: BillingMode
  cancellationPolicy: CancellationPolicy | null
  onSaved?: () => void
}

export function ResellerPolicyConfig({
  tenantId,
  billingMode,
  cancellationPolicy,
  onSaved,
}: ResellerPolicyConfigProps) {
  const [mode, setMode] = useState<BillingMode>(billingMode)
  const [modeSaving, setModeSaving] = useState<BillingMode | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)

  const [grace, setGrace] = useState<number>(cancellationPolicy?.gracePeriodDays ?? 15)
  const [keep, setKeep] = useState<boolean>(cancellationPolicy?.keepStudentsActive ?? true)
  const [notify, setNotify] = useState<boolean>(cancellationPolicy?.notifyStudents ?? true)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyOk, setPolicyOk] = useState(false)

  useEffect(() => {
    setMode(billingMode)
    setGrace(cancellationPolicy?.gracePeriodDays ?? 15)
    setKeep(cancellationPolicy?.keepStudentsActive ?? true)
    setNotify(cancellationPolicy?.notifyStudents ?? true)
  }, [billingMode, cancellationPolicy])

  async function changeMode(next: BillingMode) {
    if (next === mode || modeSaving) return
    setModeSaving(next)
    setModeError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingMode: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setModeError(body.error ?? "Falha ao salvar modo")
        return
      }
      setMode(next)
      onSaved?.()
    } catch {
      setModeError("Erro de rede ao salvar")
    } finally {
      setModeSaving(null)
    }
  }

  async function savePolicy() {
    setPolicySaving(true)
    setPolicyError(null)
    setPolicyOk(false)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancellationPolicy: {
            gracePeriodDays: grace,
            keepStudentsActive: keep,
            notifyStudents: notify,
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setPolicyError(body.error ?? "Falha ao salvar política")
        return
      }
      setPolicyOk(true)
      onSaved?.()
    } catch {
      setPolicyError("Erro de rede ao salvar política")
    } finally {
      setPolicySaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Modo de bloqueio</h3>
          <p className="mt-1 text-xs text-gray-600">
            Define como a plataforma lida com alunos inadimplentes deste revendedor.
            Espelha a configuração do painel do próprio revendedor.
          </p>
        </div>
        {modeSaving && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Salvando...
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => changeMode("AUTO")}
          disabled={modeSaving !== null}
          className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
            mode === "AUTO" ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Automático</span>
            {mode === "AUTO" && <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Bloqueia o acesso do aluno automaticamente após atraso.
          </p>
        </button>
        <button
          type="button"
          onClick={() => changeMode("MANUAL")}
          disabled={modeSaving !== null}
          className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-60 ${
            mode === "MANUAL" ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Manual</span>
            {mode === "MANUAL" && <CheckCircle2 className="h-4 w-4 text-[var(--color-pmb-green)]" />}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Admin e revendedor recebem aviso para decidir.
          </p>
        </button>
      </div>

      {modeError && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{modeError}</p>
      )}

      <div className="mt-6 space-y-4 border-t border-gray-100 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Política de cancelamento
        </h4>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[var(--color-pmb-green-900)]">
            Período de carência (dias)
          </span>
          <input
            type="number"
            min={0}
            max={365}
            value={grace}
            onChange={(e) => setGrace(Number(e.target.value))}
            className="w-28 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => setKeep(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Manter alunos ativos após cancelamento
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Notificar alunos sobre mudanças
        </label>
      </div>

      {policyError && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{policyError}</p>
      )}
      {policyOk && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Política salva com sucesso.
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={savePolicy} disabled={policySaving} className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]">
          <Save className="mr-2 h-4 w-4" />
          {policySaving ? "Salvando..." : "Salvar política"}
        </Button>
      </div>
    </div>
  )
}
