"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Save } from "lucide-react"
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
  const [grace, setGrace] = useState<number>(cancellationPolicy?.gracePeriodDays ?? 15)
  const [keep, setKeep] = useState<boolean>(cancellationPolicy?.keepStudentsActive ?? true)
  const [notify, setNotify] = useState<boolean>(cancellationPolicy?.notifyStudents ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    setMode(billingMode)
    setGrace(cancellationPolicy?.gracePeriodDays ?? 15)
    setKeep(cancellationPolicy?.keepStudentsActive ?? true)
    setNotify(cancellationPolicy?.notifyStudents ?? true)
  }, [billingMode, cancellationPolicy])

  async function save() {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingMode: mode,
          cancellationPolicy: {
            gracePeriodDays: grace,
            keepStudentsActive: keep,
            notifyStudents: notify,
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar política")
        return
      }
      setOk(true)
      onSaved?.()
    } catch {
      setError("Erro de rede ao salvar política")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Modo de bloqueio</h3>
      <p className="mt-1 text-xs text-gray-600">
        Define como a plataforma lida com alunos inadimplentes deste revendedor.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("AUTO")}
          className={`rounded-xl border-2 p-4 text-left transition-all ${
            mode === "AUTO" ? "border-blue-600 bg-blue-50/50" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1A1A2E]">Automático</span>
            {mode === "AUTO" && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Bloqueia aluno automaticamente após atraso, via API EA.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("MANUAL")}
          className={`rounded-xl border-2 p-4 text-left transition-all ${
            mode === "MANUAL" ? "border-blue-600 bg-blue-50/50" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1A1A2E]">Manual</span>
            {mode === "MANUAL" && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Admin e revendedor recebem aviso para decidir.
          </p>
        </button>
      </div>

      <div className="mt-6 space-y-4 border-t border-gray-100 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Política de cancelamento
        </h4>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[#1A1A2E]">
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

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      {ok && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Política salva com sucesso.
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar política"}
        </Button>
      </div>
    </div>
  )
}
