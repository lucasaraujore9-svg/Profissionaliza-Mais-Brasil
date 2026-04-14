"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AnalyticsFilters,
  type AnalyticsPeriod,
} from "./analytics-filters"
import {
  AnalyticsKpiCards,
  type AnalyticsKpis,
} from "./analytics-kpi-cards"
import {
  AnalyticsCharts,
  type AnalyticsChartsData,
} from "./analytics-charts"
import {
  AnalyticsRankingTable,
  type AnalyticsRankings,
} from "./analytics-ranking-table"

interface AnalyticsResponse {
  kpis: AnalyticsKpis
  charts: AnalyticsChartsData
  rankings: AnalyticsRankings
  period: AnalyticsPeriod
}

export function AdminAnalyticsClient() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d")
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: AnalyticsPeriod) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar analytics")
        return
      }
      setData(body.data as AnalyticsResponse)
    } catch {
      setError("Erro de rede ao carregar analytics")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [load, period])

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando analytics...
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
      <AnalyticsFilters period={period} onPeriodChange={setPeriod} />
      <AnalyticsKpiCards kpis={data.kpis} />
      <AnalyticsCharts data={data.charts} />
      <AnalyticsRankingTable rankings={data.rankings} />
    </div>
  )
}
