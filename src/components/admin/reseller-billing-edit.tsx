"use client"

import { useState } from "react"
import { Save, CalendarClock, DollarSign, ExternalLink, AlertTriangle } from "lucide-react"

interface Props {
  tenantId: string
  planValue: number
  asaasCustomerId: string | null
  asaasNextDueDate: string | null
  asaasSubscriptionId: string | null
  asaasSubscriptionStatus: string | null
  asaasSubscriptionValue: number | null
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

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return d.toISOString().slice(0, 10)
}

export function ResellerBillingEdit({
  tenantId,
  planValue,
  asaasCustomerId,
  asaasNextDueDate,
  asaasSubscriptionId,
  asaasSubscriptionStatus,
  asaasSubscriptionValue,
  onSaved,
}: Props) {
  const [value, setValue] = useState<string>(String(planValue))
  const [dueDate, setDueDate] = useState<string>(
    isoToYmd(asaasNextDueDate) || defaultDueDate(),
  )
  const [cpfCnpj, setCpfCnpj] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)

  const noSubscription = !asaasSubscriptionId
  const needsCpf = noSubscription && !asaasCustomerId

  // Compara contra o valor real do Asaas (não o banco) para detectar dessincronia.
  const effectiveValue = asaasSubscriptionValue ?? planValue
  const dirty =
    Number(value) !== effectiveValue ||
    dueDate !== isoToYmd(asaasNextDueDate) ||
    noSubscription

  async function save() {
    setError(null)
    setOk(null)
    setInvoiceUrl(null)
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setError("Valor inválido")
      return
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError("Data inválida")
      return
    }
    if (needsCpf && !cpfCnpj.replace(/\D/g, "")) {
      setError("CPF/CNPJ é obrigatório para criar a cobrança automática")
      return
    }

    setSaving(true)
    try {
      const body: {
        planValue?: number
        nextDueDate?: string
        ownerCpfCnpj?: string
      } = {}
      if (numericValue !== effectiveValue) body.planValue = numericValue
      if (dueDate) body.nextDueDate = dueDate
      if (needsCpf && cpfCnpj) body.ownerCpfCnpj = cpfCnpj.replace(/\D/g, "")

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

      if (json.data?.invoiceUrl) {
        setInvoiceUrl(json.data.invoiceUrl)
      }

      if (json.data?.subscriptionCreated) {
        setOk("Cobrança automática criada com sucesso.")
      } else if (json.data?.asaasUpdated) {
        setOk("Cobrança atualizada com sucesso.")
      } else {
        setOk("Banco atualizado.")
      }

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
        {noSubscription
          ? "Este revendedor ainda não tem cobrança automática configurada. Preencha os dados para criar."
          : "Altere o valor e a próxima data de vencimento."}
      </p>

      {noSubscription && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Sem cobrança automática — o sistema não cobrará automaticamente este
            revendedor até criar uma.
          </span>
        </div>
      )}

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
            {asaasSubscriptionValue !== null && asaasSubscriptionValue !== planValue ? (
              <>
                Banco: {brl(planValue)} ·{" "}
                <span className="font-semibold text-amber-600">
                  Gateway: {brl(asaasSubscriptionValue)} (dessincronizado)
                </span>
              </>
            ) : (
              <>Atual: {brl(effectiveValue)}</>
            )}
          </span>
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <CalendarClock className="h-3.5 w-3.5" />
            {noSubscription ? "Primeiro vencimento" : "Próximo vencimento"}
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
          {!noSubscription && (
            <span className="mt-1 block text-[11px] text-gray-500">
              {asaasSubscriptionId
                ? `${asaasNextDueDate ? new Date(asaasNextDueDate).toLocaleDateString("pt-BR") : "—"}${asaasSubscriptionStatus ? ` · ${asaasSubscriptionStatus}` : ""}`
                : "Sem cobrança ativa configurada"}
            </span>
          )}
        </label>

        {needsCpf && (
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">
              CPF / CNPJ do responsável
            </span>
            <input
              type="text"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder="Apenas números"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-gray-500">
              Necessário para identificar o pagador.
            </span>
          </label>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <p>{ok}</p>
          {invoiceUrl && (
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir link da primeira fatura
            </a>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving
            ? "Salvando..."
            : noSubscription
              ? "Configurar cobrança automática"
              : "Salvar mensalidade"}
        </button>
      </div>
    </div>
  )
}
