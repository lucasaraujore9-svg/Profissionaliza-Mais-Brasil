"use client"

import { useState } from "react"
import { Save, CalendarClock, DollarSign, ExternalLink, AlertTriangle } from "lucide-react"
import { CortesiaReasonDialog, type CortesiaPrompt } from "./cortesia-reason-dialog"

interface Props {
  tenantId: string
  planValue: number
  asaasCustomerId: string | null
  asaasNextDueDate: string | null
  asaasSubscriptionId: string | null
  asaasSubscriptionStatus: string | null
  asaasSubscriptionValue: number | null
  asaasPromoSubscriptionId?: string | null
  promoValue?: number | null
  promoMonths?: number | null
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
  asaasPromoSubscriptionId,
  promoValue,
  promoMonths,
  onSaved,
}: Props) {
  const [value, setValue] = useState<string>(String(planValue))
  const [dueDate, setDueDate] = useState<string>(
    isoToYmd(asaasNextDueDate) || defaultDueDate(),
  )
  const [cpfCnpj, setCpfCnpj] = useState("")
  const [promoEnabled, setPromoEnabled] = useState<boolean>(
    Boolean(asaasPromoSubscriptionId),
  )
  const [promoValueStr, setPromoValueStr] = useState<string>(
    promoValue != null ? String(promoValue) : "",
  )
  const [promoMonthsStr, setPromoMonthsStr] = useState<string>(
    promoMonths != null ? String(promoMonths) : "3",
  )
  const [saving, setSaving] = useState(false)
  const [cortesia, setCortesia] = useState<CortesiaPrompt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [firstPaymentId, setFirstPaymentId] = useState<string | null>(null)

  const noSubscription = !asaasSubscriptionId
  const numericValue = Number(value.replace(",", "."))
  const isFree = value.trim() !== "" && numericValue === 0
  const needsCpf = !isFree && noSubscription && !asaasCustomerId

  // Compara contra o valor real do Asaas (não o banco) para detectar dessincronia.
  const effectiveValue = asaasSubscriptionValue ?? planValue
  const hadPromo = Boolean(asaasPromoSubscriptionId)
  const promoDirty =
    promoEnabled !== hadPromo ||
    (promoEnabled &&
      (Number(promoValueStr.replace(",", ".")) !== (promoValue ?? -1) ||
        Number(promoMonthsStr) !== (promoMonths ?? -1)))
  const dirty =
    numericValue !== effectiveValue ||
    dueDate !== isoToYmd(asaasNextDueDate) ||
    noSubscription ||
    promoDirty

  /** Devolve `true` só quando a cobrança foi realmente gravada. */
  async function save(reason?: string): Promise<boolean> {
    setError(null)
    setOk(null)
    setFirstPaymentId(null)
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setError("Valor inválido")
      return false
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError("Data inválida")
      return false
    }
    if (needsCpf && !cpfCnpj.replace(/\D/g, "")) {
      setError("CPF/CNPJ é obrigatório para criar a cobrança automática")
      return false
    }

    const usePromo = promoEnabled && !isFree
    const promoValueNum = Number(promoValueStr.replace(",", "."))
    const promoMonthsNum = Number(promoMonthsStr)
    if (usePromo) {
      if (!Number.isFinite(promoValueNum) || promoValueNum < 0) {
        setError("Valor promocional inválido")
        return false
      }
      if (!Number.isInteger(promoMonthsNum) || promoMonthsNum < 1) {
        setError("Nº de meses da promoção inválido")
        return false
      }
      if (numericValue <= 0) {
        setError("Promoção exige mensalidade cheia maior que zero")
        return false
      }
    }

    setSaving(true)
    try {
      const body: {
        planValue?: number
        nextDueDate?: string
        ownerCpfCnpj?: string
        promoMonths?: number
        promoValue?: number
        reason?: string
      } = {}
      if (reason) body.reason = reason
      // Promo e "tornar grátis" exigem reenviar o planValue mesmo se igual,
      // pois a rota decide o fluxo a partir dele.
      if (numericValue !== effectiveValue || usePromo || isFree) {
        body.planValue = numericValue
      }
      if (dueDate && !isFree) body.nextDueDate = dueDate
      if (needsCpf && cpfCnpj) body.ownerCpfCnpj = cpfCnpj.replace(/\D/g, "")
      if (usePromo) {
        body.promoMonths = promoMonthsNum
        body.promoValue = promoValueNum
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
        // Cortesia excepcional: quem tem a permissão só precisa justificar.
        if (res.status === 403 && json.requiresReason) {
          setCortesia({ message: json.error, retry: (r) => save(r) })
          return false
        }
        setError(json.error ?? "Falha ao salvar")
        return false
      }

      if (json.data?.firstPaymentId) {
        setFirstPaymentId(json.data.firstPaymentId)
      }

      // A unidade segue CANCELADA: arrumar a cobrança não reabre a vitrine.
      // Sem este aviso o admin acha que resolveu e a loja continua fora do ar.
      const pendente = json.data?.stillCancelled
        ? " Atenção: a unidade continua CANCELADA e a vitrine segue fora do ar — reative em Configurações › Status da assinatura."
        : ""

      if (json.data?.free) {
        setOk("Revenda agora é gratuita — cobrança removida do Asaas." + pendente)
      } else if (json.data?.promo) {
        setOk("Promoção configurada com sucesso." + pendente)
      } else if (json.data?.subscriptionCreated) {
        setOk("Cobrança automática criada com sucesso." + pendente)
      } else if (json.data?.asaasUpdated) {
        setOk("Cobrança atualizada com sucesso." + pendente)
      } else {
        setOk("Banco atualizado.")
      }

      onSaved?.()
      return true
    } catch {
      setError("Erro de rede ao salvar")
      return false
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

        {isFree && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Valor <strong>R$ 0</strong>: ao salvar, qualquer cobrança no Asaas é
              cancelada e a revenda fica <strong>gratuita</strong>.
            </span>
          </div>
        )}

        {!isFree && (
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
        )}

        {/* Promoção: as N primeiras mensalidades num valor reduzido */}
        {!isFree && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={promoEnabled}
                onChange={(e) => setPromoEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Mensalidade promocional nas primeiras parcelas
            </label>
            {hadPromo && (
              <span className="mt-1.5 block text-[11px] text-emerald-700">
                Promoção ativa: {promoMonths ?? "?"}× {promoValue != null ? brl(promoValue) : "—"}, depois {brl(effectiveValue)}.
              </span>
            )}
            {promoEnabled && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-700">
                    Nº de meses na promoção
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    value={promoMonthsStr}
                    onChange={(e) => setPromoMonthsStr(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-700">
                    Valor promocional (R$)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={promoValueStr}
                    onChange={(e) => setPromoValueStr(e.target.value)}
                    placeholder="Ex: 49.90"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
                  />
                </label>
                <span className="text-[11px] text-gray-500 sm:col-span-2">
                  Salvar recria as cobranças: as primeiras parcelas saem no valor
                  promocional e depois volta à mensalidade cheia acima.
                </span>
              </div>
            )}
          </div>
        )}

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
          {firstPaymentId && (
            <a
              href={`/cobranca/${firstPaymentId}`}
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
          onClick={() => save()}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving
            ? "Salvando..."
            : isFree
              ? "Tornar gratuita"
              : promoEnabled
                ? "Salvar promoção"
                : noSubscription
                  ? "Configurar cobrança automática"
                  : "Salvar mensalidade"}
        </button>
      </div>

      <CortesiaReasonDialog prompt={cortesia} onClose={() => setCortesia(null)} />
    </div>
  )
}
