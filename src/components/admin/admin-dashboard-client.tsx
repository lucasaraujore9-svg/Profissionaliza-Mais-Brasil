"use client"

import { useCallback, useEffect, useState } from "react"
import { AdminMetricCards, type AdminMetrics } from "./admin-metric-cards"
import {
  AdminQuickStatsBar,
  type AdminQuickStats,
} from "./admin-quick-stats-bar"
import {
  AdminDualRevenueChart,
  type RevenuePeriod,
  type RevenuePoint,
} from "./admin-dual-revenue-chart"
import {
  AdminTopResellersTable,
  type TopResellerRow,
} from "./admin-top-resellers-table"
import {
  AdminAlertsPanel,
  type DashboardAlert,
} from "./admin-alerts-panel"

interface DashboardData {
  period: RevenuePeriod
  metrics: AdminMetrics
  quickStats: AdminQuickStats
  chart: RevenuePoint[]
  topResellers: TopResellerRow[]
  alerts: DashboardAlert[]
}

export function AdminDashboardClient() {
  const [period, setPeriod] = useState<RevenuePeriod>("30d")
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: RevenuePeriod) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/dashboard?period=${p}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar dashboard")
        return
      }
      setData(body.data)
    } catch {
      setError("Erro de rede ao carregar dashboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [period, load])

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando métricas...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <AdminQuickStatsBar stats={data.quickStats} />
      <AdminMetricCards metrics={data.metrics} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <AdminDualRevenueChart
          period={period}
          points={data.chart}
          onPeriodChange={setPeriod}
        />
        <AdminAlertsPanel alerts={data.alerts} />
      </div>
      <AdminTopResellersTable resellers={data.topResellers} />
    </div>
  )
}
