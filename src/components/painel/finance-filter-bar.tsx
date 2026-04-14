"use client"

import { Calendar } from "lucide-react"

export type FinanceStatusFilter =
  | "TODOS"
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "REFUNDED"
  | "CANCELLED"

export type FinanceTypeFilter = "TODOS" | "ONE_TIME" | "MONTHLY"

const statusFilters: { key: FinanceStatusFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "APPROVED", label: "Pago" },
  { key: "PENDING", label: "Pendente" },
  { key: "CANCELLED", label: "Cancelado" },
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
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
        <Calendar className="h-4 w-4 text-gray-400" />
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="bg-transparent text-sm text-gray-700 outline-none"
        />
        <span>—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="bg-transparent text-sm text-gray-700 outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {statusFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onStatusChange(filter.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === filter.key
                ? "bg-white text-[#1A1A2E] shadow-sm"
                : "text-gray-600 hover:text-[#1A1A2E]"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <select
        value={type}
        onChange={(e) => onTypeChange(e.target.value as FinanceTypeFilter)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
      >
        <option value="TODOS">Todos os tipos</option>
        <option value="ONE_TIME">Único</option>
        <option value="MONTHLY">Recorrente</option>
      </select>
    </div>
  )
}
