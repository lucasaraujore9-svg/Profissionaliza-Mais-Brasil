"use client"

import { useCallback, useEffect, useState } from "react"
import { LayoutDashboard } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import {
  StatCardsSkeleton,
  BlockSkeleton,
} from "@/components/shared/loading-skeletons"
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

interface DashboardWrapperProps {
  firstName: string
}

function PeriodSelector({
  period,
  onChange,
  disabled,
}: {
  period: DashboardPeriod
  onChange: (p: DashboardPeriod) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
            period === opt.value
              ? "bg-white text-[var(--color-pmb-green)] shadow-sm"
              : "text-gray-600 hover:text-[var(--color-pmb-green-700)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function DashboardWrapper({ firstName }: DashboardWrapperProps) {
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

  // Primeiro acesso / sem nenhuma atividade no período: evitamos exibir
  // "R$ 0" e gráficos vazios como se fossem dado de verdade.
  const isFirstRun =
    !!data &&
    data.metrics.revenue === 0 &&
    data.metrics.students === 0 &&
    data.metrics.enrollmentsTotal === 0 &&
    data.recentSales.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bem-vindo, ${firstName}`}
        description={
          data
            ? `Acompanhe receita, alunos e conversão ${PERIOD_DESCRIPTIONS[period]}.`
            : "Acompanhe receita, alunos e conversão no período escolhido."
        }
        actions={
          <PeriodSelector
            period={period}
            onChange={setPeriod}
            disabled={loading && !data}
          />
        }
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : !data ? (
        // Carregando pela primeira vez: skeletons preservam o layout sem flash
        // de "R$ 0".
        <div className="space-y-6">
          <StatCardsSkeleton count={4} />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <BlockSkeleton className="h-72" />
            <BlockSkeleton className="h-72" />
          </div>
          <BlockSkeleton className="h-64" />
        </div>
      ) : isFirstRun ? (
        <div className="space-y-6">
          <EmptyState
            icon={LayoutDashboard}
            title="Ainda não há atividade neste período"
            description="Quando suas primeiras vendas começarem a entrar, receita, alunos e conversão aparecerão aqui. Comece configurando sua vitrine e criando cupons."
          />
          <QuickActions />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}
        >
          <MetricCards
            metrics={data.metrics}
            periodLabel={PERIOD_DESCRIPTIONS[period]}
          />

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
