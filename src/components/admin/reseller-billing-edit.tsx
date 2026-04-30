"use client"

import { useState } from "react"
import { Save, CalendarClock, DollarSign } from "lucide-react"

interface Props {
  tenantId: string
  planValue: number
  asaasNextDueDate: string | null
  asaasSubscriptionId: string | null
  asaasSubscriptionStatus: string | null
  onSaved?: () => void
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function isoToYmd(iso: string | null): string {
  if (!iso) return ""
  return iso.slice(0, 10)
}

export function ResellerBillingEdit({
  tenantId,
  planValue,
  asaasNextDueDate,
  asaasSubscriptionId,
  asaasSubscriptionStatus,
  onSaved,
}: Props) {
  const [value, setValue] = useState<string>(String(planValue))
  const [dueDate, setDueDate] = useState<string>(isoToYmd(asaasNextDueDate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const dirty =
    Number(value) !== planValue || dueDate !== isoToYmd(asaasNextDueDate)

  async function save() {
    setError(null)
    setOk(null)
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setError("Valor inválido")
      return
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError("Data inválida")
      return
    }

    setSaving(true)
    try {
      const body: { planValue?: number; nextDueDate?: string } = {}
      if (numericValue !== planValue) body.planValue = numericValue
      if (dueDate && dueDate !== isoToYmd(asaasNextDueDate)) {
        body.nextDueDate = dueDate
      }

      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/billing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Falha ao salvar")
        return
      }
      setOk(
        json.data?.asaasUpdated
          ? "Cobrança atualizada no Asaas e no banco."
          : "Banco atualizado. Asaas não foi sincronizado (sem subscription).",
      )
      onSaved?.()
    } catch {
      setError("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
        Mensalidade do revendedor
      </h3>
      <p className="mt-1 text-xs text-gray-600">
        Altere o valor e a próxima data de vencimento. Se houver assinatura
        ativa no Asaas, ela é atualizada junto.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <DollarSign className="h-3.5 w-3.5" />
            Valor da mensalidade (R$)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            Atual: {brl(planValue)}
          </span>
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <CalendarClock className="h-3.5 w-3.5" />
            Próximo vencimento
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            {asaasSubscriptionId
              ? `Asaas: ${asaasNextDueDate ? new Date(asaasNextDueDate).toLocaleDateString("pt-BR") : "—"}${asaasSubscriptionStatus ? ` · ${asaasSubscriptionStatus}` : ""}`
              : "Sem assinatura ativa no Asaas"}
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {ok}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar mensalidade"}
        </button>
      </div>
    </div>
  )
}
