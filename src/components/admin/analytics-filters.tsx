"use client"

import { useState } from "react"
import { Calendar, Filter } from "lucide-react"

const PERIODS = ["7d", "30d", "90d", "12m"] as const
const STATUSES = ["Todos", "Ativos", "Suspensos"] as const

export function AnalyticsFilters() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30d")
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Todos")

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          Período
        </span>
        <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                period === p ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <Filter className="h-3.5 w-3.5" />
          Status
        </span>
        <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                status === s ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
          <option>Todos os revendedores</option>
          <option>Top 10 revendedores</option>
          <option>Apenas novos</option>
        </select>
      </div>
    </div>
  )
}
