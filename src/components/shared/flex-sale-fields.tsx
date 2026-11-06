"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addMonthsClampedUtc } from "@/lib/dates"
import { flexPlanSummary, flexScheduleError, flexTotal } from "@/lib/installments/flex"
import {
  INSTALLMENT_REVEAL_WINDOW_DAYS,
  MAX_BOLETO_INSTALLMENTS,
} from "@/lib/installments/schedule"
import { todayYmd } from "./external-first-payment-field"

/**
 * "1.234,56" / "89,9" / "89.90" -> número (0 quando vazio ou inválido). Com
 * vírgula, o ponto é milhar; sem vírgula, o ponto é a casa decimal.
 */
export function parseBrl(v: string): number {
  const t = v.trim()
  if (!t) return 0
  // "10.000" sem vírgula é milhar (R$ 10 mil), não 10; "10.5" segue decimal.
  const n = Number(
    t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t,
  )
  return Number.isFinite(n) ? n : 0
}

/** Formulário da venda parcelada (valores como o vendedor digitou). */
export interface FlexSaleState {
  count: number
  value: string
  hasDownPayment: boolean
  downPayment: string
  /** YYYY-MM-DD. A entrada não tem data: vence na venda. */
  firstDueDate: string
}

/** Hoje + 1 mês, no dia de Brasília (YYYY-MM-DD). */
export function defaultFirstDueDate(now: Date = new Date()): string {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  return addMonthsClampedUtc(new Date(`${today}T12:00:00Z`), 1).toISOString().slice(0, 10)
}

/** Curso mensal abre com os meses e a mensalidade da unidade. */
export function flexSaleDefaults(
  monthly?: { months: number; value: number } | null,
  now: Date = new Date(),
): FlexSaleState {
  return {
    count: monthly ? Math.min(Math.max(monthly.months, 1), MAX_BOLETO_INSTALLMENTS) : 2,
    value: monthly ? monthly.value.toFixed(2).replace(".", ",") : "",
    hasDownPayment: false,
    downPayment: "",
    firstDueDate: defaultFirstDueDate(now),
  }
}

/** Corpo `parcelado` das rotas de venda + validação e prévia (mesmas regras do servidor). */
export function flexSaleInput(s: FlexSaleState, now: Date = new Date()) {
  const parcelado = {
    count: s.count,
    installmentValue: parseBrl(s.value),
    downPayment: s.hasDownPayment ? parseBrl(s.downPayment) : null,
    firstDueDate: s.firstDueDate,
  }
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const error =
    !s.firstDueDate || s.firstDueDate < today
      ? "O 1º vencimento deve ser hoje ou uma data futura."
      : flexScheduleError({
          ...parcelado,
          firstDueDate: new Date(`${s.firstDueDate}T12:00:00Z`),
          saleDate: now,
        })
  return {
    parcelado,
    error,
    total: flexTotal(parcelado),
    summary: flexPlanSummary({ ...parcelado, hasDownPayment: s.hasDownPayment }),
  }
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Venda parcelada: entrada opcional + N parcelas iguais + 1º vencimento. Nada é
 * cobrado na venda: o aluno escolhe o meio de cada parcela no link.
 */
export function FlexSaleFields({
  idPrefix,
  state,
  onChange,
  basePrice,
  cap,
  serverError,
}: {
  idPrefix: string
  state: FlexSaleState
  onChange: (s: FlexSaleState) => void
  /** Preço de vitrine da venda: o que o total ficar abaixo dele é desconto. */
  basePrice: number
  cap: number
  serverError?: string
}) {
  const { error, total, summary } = flexSaleInput(state)
  const discount = Math.round((basePrice - total) * 100) / 100
  const set = (patch: Partial<FlexSaleState>) => onChange({ ...state, ...patch })

  return (
    <div className="grid gap-3 rounded-xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-4 sm:grid-cols-3">
      <div>
        <Label htmlFor={`${idPrefix}-parcelas`}>Nº de parcelas</Label>
        <Select
          value={String(state.count)}
          onValueChange={(v) => set({ count: Number(v) || 1 })}
        >
          <SelectTrigger id={`${idPrefix}-parcelas`} className="mt-1.5 h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: MAX_BOLETO_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-valor`}>Valor da parcela</Label>
        <Input
          id={`${idPrefix}-valor`}
          inputMode="decimal"
          value={state.value}
          onChange={(e) => set({ value: e.target.value })}
          placeholder="Ex: 89,90"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-venc`}>1º vencimento</Label>
        <Input
          id={`${idPrefix}-venc`}
          type="date"
          value={state.firstDueDate}
          min={todayYmd()}
          onChange={(e) => set({ firstDueDate: e.target.value })}
          className="mt-1.5"
        />
      </div>
      <div className="sm:col-span-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={state.hasDownPayment}
            onChange={(e) => set({ hasDownPayment: e.target.checked })}
          />
          Tem entrada?
        </label>
        {state.hasDownPayment && (
          <div className="mt-2 max-w-[12rem]">
            <Label htmlFor={`${idPrefix}-entrada`}>Valor da entrada</Label>
            <Input
              id={`${idPrefix}-entrada`}
              inputMode="decimal"
              value={state.downPayment}
              onChange={(e) => set({ downPayment: e.target.value })}
              placeholder="Ex: 100,00"
              className="mt-1.5"
            />
            <p className="mt-1 text-[11px] text-gray-500">Vence na data da venda.</p>
          </div>
        )}
      </div>
      <div className="sm:col-span-3">
        {error ? (
          <p className="text-xs font-medium text-rose-600">{error}</p>
        ) : (
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {summary}
            {discount > 0 && (
              <span className="ml-1 text-xs font-normal text-gray-600">
                · {fmt(discount)} abaixo do preço ({((discount / basePrice) * 100).toFixed(1).replace(".", ",")}%)
              </span>
            )}
          </p>
        )}
        {serverError && <p className="mt-1 text-xs text-rose-600">{serverError}</p>}
      </div>
      <p className="text-xs text-gray-600 sm:col-span-3">
        Nada é cobrado agora: o aluno recebe o link e escolhe como pagar cada parcela
        (PIX, boleto ou cartão). Cada parcela fica disponível{" "}
        {INSTALLMENT_REVEAL_WINDOW_DAYS} dias antes do vencimento, e o acesso é
        liberado quando a 1ª for paga. Total abaixo do preço conta como desconto e
        respeita seu limite ({cap}%).
      </p>
    </div>
  )
}
