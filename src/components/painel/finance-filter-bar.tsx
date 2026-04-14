"use client"

import { useState } from "react"
import { Calendar } from "lucide-react"

const statusFilters = ["Todos", "Pago", "Pendente", "Cancelado"] as const

export function FinanceFilterBar() {
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("Todos")

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
        <Calendar className="h-4 w-4 text-gray-400" />
        <span>01/04/2026 — 30/04/2026</span>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {statusFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatus(filter)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === filter
                ? "bg-white text-[#1A1A2E] shadow-sm"
                : "text-gray-600 hover:text-[#1A1A2E]"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
        <option>Todos os tipos</option>
        <option>Único</option>
        <option>Recorrente</option>
      </select>
    </div>
  )
}
