"use client"

import { Calendar } from "lucide-react"

export const ANALYTICS_PERIODS = ["7d", "30d", "90d", "12m"] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

interface AnalyticsFiltersProps {
  period: AnalyticsPeriod
  onPeriodChange: (period: AnalyticsPeriod) => void
}

export function AnalyticsFilters({ period, onPeriodChange }: AnalyticsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          Período
        </span>
        <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
          {ANALYTICS_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                period === p ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
