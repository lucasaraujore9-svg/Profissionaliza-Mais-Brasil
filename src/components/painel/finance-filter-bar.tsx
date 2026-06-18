"use client"

import { Calendar, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FINANCE_STATUS_META } from "./finance-status"

export type FinanceStatusFilter =
  | "TODOS"
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "REFUNDED"
  | "CANCELLED"

export type FinanceTypeFilter = "TODOS" | "ONE_TIME" | "MONTHLY"

const DEFAULT_STATUS: FinanceStatusFilter = "TODOS"
const DEFAULT_TYPE: FinanceTypeFilter = "TODOS"

// Chips reconciliados com a fonte unica de status (FINANCE_STATUS_META) — so
// expomos statuses que a tabela tambem sabe exibir, evitando drift filtro/exibicao.
const statusFilters: { key: FinanceStatusFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "APPROVED", label: FINANCE_STATUS_META.APPROVED.label },
  { key: "PENDING", label: FINANCE_STATUS_META.PENDING.label },
  { key: "REJECTED", label: FINANCE_STATUS_META.REJECTED.label },
  { key: "REFUNDED", label: FINANCE_STATUS_META.REFUNDED.label },
  { key: "CANCELLED", label: FINANCE_STATUS_META.CANCELLED.label },
]

interface FinanceFilterBarProps {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  status: FinanceStatusFilter
  onStatusChange: (status: FinanceStatusFilter) => void
  type: FinanceTypeFilter
  onTypeChange: (type: FinanceTypeFilter) => void
}

export function FinanceFilterBar({
  from,
  to,
  onFromChange,
  onToChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
}: FinanceFilterBarProps) {
  const hasNonDefault = status !== DEFAULT_STATUS || type !== DEFAULT_TYPE

  function handleReset() {
    onStatusChange(DEFAULT_STATUS)
    onTypeChange(DEFAULT_TYPE)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
        <Calendar
          className="h-4 w-4 text-[var(--color-pmb-green)]"
          aria-hidden="true"
        />
        <label htmlFor="finance-from" className="sr-only">
          Data inicial
        </label>
        <input
          id="finance-from"
          type="date"
          aria-label="Data inicial"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className="bg-transparent text-sm text-gray-700 outline-none"
        />
        <span aria-hidden="true">—</span>
        <label htmlFor="finance-to" className="sr-only">
          Data final
        </label>
        <input
          id="finance-to"
          type="date"
          aria-label="Data final"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className="bg-transparent text-sm text-gray-700 outline-none"
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-[var(--color-pmb-mist)] p-1"
        role="group"
        aria-label="Filtrar por status"
      >
        {statusFilters.map((filter) => {
          const active = status === filter.key
          return (
            <button
              key={filter.key}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusChange(filter.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                  : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
              }`}
            >
              {filter.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={type}
          onValueChange={(v) =>
            onTypeChange((v ?? DEFAULT_TYPE) as FinanceTypeFilter)
          }
        >
          <SelectTrigger
            aria-label="Filtrar por tipo de pagamento"
            className="h-9"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os tipos</SelectItem>
            <SelectItem value="ONE_TIME">Único</SelectItem>
            <SelectItem value="MONTHLY">Recorrente</SelectItem>
          </SelectContent>
        </Select>

        {hasNonDefault && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--color-pmb-green-700)] transition-colors hover:bg-[var(--color-pmb-lime-50)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpar
          </button>
        )}
      </div>
    </div>
  )
}
