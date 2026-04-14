"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { MetricCards, type DashboardMetrics } from "./metric-cards"
import { RevenueChart, type RevenueChartPoint } from "./revenue-chart"
import { RecentSales, type RecentSale } from "./recent-sales"
import { QuickActions } from "./quick-actions"

interface DashboardData {
  metrics: DashboardMetrics
  revenueChart: RevenueChartPoint[]
  recentSales: RecentSale[]
}

export function DashboardWrapper() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/painel/dashboard")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar")
        return json.data as DashboardData
      })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando dashboard...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MetricCards metrics={data.metrics} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <RevenueChart data={data.revenueChart} />
        <QuickActions />
      </div>

      <RecentSales sales={data.recentSales} />
    </div>
  )
}
