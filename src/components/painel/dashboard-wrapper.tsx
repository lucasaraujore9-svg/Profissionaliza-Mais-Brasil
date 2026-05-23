"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { MetricCards, type DashboardMetrics } from "./metric-cards"
import { RevenueChart, type RevenueChartPoint } from "./revenue-chart"
import { RecentSales, type RecentSale } from "./recent-sales"
import { QuickActions } from "./quick-actions"

export type DashboardPeriod = "today" | "7d" | "30d" | "90d" | "12m"

interface DashboardData {
  period: DashboardPeriod
  range: { start: string; end: string }
  metrics: DashboardMetrics
  revenueChart: RevenueChartPoint[]
  recentSales: RecentSale[]
}

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
]

const PERIOD_DESCRIPTIONS: Record<DashboardPeriod, string> = {
  today: "hoje",
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  "90d": "nos últimos 90 dias",
  "12m": "nos últimos 12 meses",
}

export function DashboardWrapper() {
  const [period, setPeriod] = useState<DashboardPeriod>("30d")
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: DashboardPeriod) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/painel/dashboard?period=${p}`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao carregar")
      }
      setData(json.data as DashboardData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [period, load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Período de análise
          </h2>
          <p className="text-xs text-gray-500">
            Mostrando dados {PERIOD_DESCRIPTIONS[period]}.
          </p>
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                period === opt.value
                  ? "bg-white text-[var(--color-pmb-green)] shadow-sm"
                  : "text-gray-600 hover:text-[var(--color-pmb-green-700)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando dashboard...
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <MetricCards metrics={data.metrics} periodLabel={PERIOD_DESCRIPTIONS[period]} />

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <RevenueChart
              data={data.revenueChart}
              periodLabel={PERIOD_DESCRIPTIONS[period]}
            />
            <QuickActions />
          </div>

          <RecentSales sales={data.recentSales} />
        </div>
      )}
    </div>
  )
}
