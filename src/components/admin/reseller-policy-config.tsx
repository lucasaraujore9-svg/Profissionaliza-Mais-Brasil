"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AUTO_CANCEL_OVERDUE_DAYS,
  DEFAULT_SUSPEND_GRACE_DAYS,
} from "@/lib/tenants/overdue-policy"

export type BillingMode = "AUTO" | "MANUAL"

export interface CancellationPolicy {
  gracePeriodDays?: number
  keepStudentsActive?: boolean
  notifyStudents?: boolean
  autoCancel?: boolean
  autoCancelAfterDays?: number
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

  // Os defaults REPRODUZEM o que o cron faz quando a unidade não tem política
  // (lib/tenants/overdue-policy). Antes a carência aparecia como 15 enquanto a
  // varredura suspendia em 3 — quem abrisse a tela e salvasse sem mexer em nada
  // triplicava o prazo da unidade sem querer (aconteceu em produção).
  const [grace, setGrace] = useState<number>(
    cancellationPolicy?.gracePeriodDays ?? DEFAULT_SUSPEND_GRACE_DAYS,
  )
  const [keep, setKeep] = useState<boolean>(cancellationPolicy?.keepStudentsActive ?? true)
  const [notify, setNotify] = useState<boolean>(cancellationPolicy?.notifyStudents ?? true)
  const [autoCancel, setAutoCancel] = useState<boolean>(
    cancellationPolicy?.autoCancel !== false,
  )
  const [cancelDays, setCancelDays] = useState<number>(
    cancellationPolicy?.autoCancelAfterDays ?? AUTO_CANCEL_OVERDUE_DAYS,
  )
  // O corte nunca vem antes da suspensão — a tela mostra o prazo que VAI valer.
  const effectiveCancelDays = Math.max(cancelDays, grace)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyOk, setPolicyOk] = useState(false)

  useEffect(() => {
    setMode(billingMode)
    setGrace(cancellationPolicy?.gracePeriodDays ?? DEFAULT_SUSPEND_GRACE_DAYS)
    setKeep(cancellationPolicy?.keepStudentsActive ?? true)
    setNotify(cancellationPolicy?.notifyStudents ?? true)
    setAutoCancel(cancellationPolicy?.autoCancel !== false)
    setCancelDays(cancellationPolicy?.autoCancelAfterDays ?? AUTO_CANCEL_OVERDUE_DAYS)
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
            autoCancel,
            autoCancelAfterDays: cancelDays,
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
          <span className="text-[11px] text-gray-500">
            Dias de atraso até a unidade ser suspensa.
          </span>
        </label>

        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <label className="flex items-center gap-2 text-xs text-gray-800">
            <input
              type="checkbox"
              checked={autoCancel}
              onChange={(e) => setAutoCancel(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="font-medium">Cancelar automaticamente por inadimplência</span>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--color-pmb-green-900)]">
              Cancelar após (dias de atraso)
            </span>
            <input
              type="number"
              min={0}
              max={365}
              value={cancelDays}
              disabled={!autoCancel}
              onChange={(e) => setCancelDays(Number(e.target.value))}
              className="w-28 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm disabled:bg-gray-100 disabled:text-gray-400"
            />
          </label>
          <p className="text-[11px] text-amber-900">
            {autoCancel ? (
              <>
                A unidade será <strong>cancelada</strong> após{" "}
                <strong>{effectiveCancelDays} dias</strong> de atraso: a assinatura no
                Asaas é encerrada, as cobranças em aberto são removidas e a vitrine sai
                do ar. Não volta sozinha com o pagamento.
                {effectiveCancelDays !== cancelDays && (
                  <> O prazo nunca fica abaixo da carência de suspensão ({grace} dias).</>
                )}
              </>
            ) : (
              <>
                Cancelamento automático <strong>desligado</strong> para esta unidade. Ela
                será suspensa por inadimplência, mas nunca cancelada sozinha — use
                enquanto houver negociação em curso.
              </>
            )}
          </p>
        </div>

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
