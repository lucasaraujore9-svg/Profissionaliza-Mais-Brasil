import { TrendingUp, Users, Target, Receipt } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export interface DashboardMetrics {
  monthlyRevenue: number
  monthlyRevenueChange: number | null
  monthlyStudents: number
  monthlyStudentsChange: number | null
  conversionRate: number | null
  ticketAverage: number
  enrollmentsCount: number
}

interface MetricCardsProps {
  metrics: DashboardMetrics
}

function formatPercent(value: number | null): { label: string; positive: boolean } {
  if (value === null) {
    return { label: "—", positive: true }
  }
  const positive = value >= 0
  const formatted = `${positive ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`
  return { label: formatted, positive }
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const revenueChange = formatPercent(metrics.monthlyRevenueChange)
  const studentsChange = formatPercent(metrics.monthlyStudentsChange)
  const conversion = metrics.conversionRate === null
    ? "—"
    : `${metrics.conversionRate.toFixed(1).replace(".", ",")}%`

  const items = [
    {
      label: "Receita do mês",
      value: formatCurrency(metrics.monthlyRevenue),
      change: revenueChange.label,
      positive: revenueChange.positive,
      hint: "vs mês anterior",
      icon: TrendingUp,
    },
    {
      label: "Alunos novos",
      value: String(metrics.monthlyStudents),
      change: studentsChange.label,
      positive: studentsChange.positive,
      hint: "vs mês anterior",
      icon: Users,
    },
    {
      label: "Taxa de conversão",
      value: conversion,
      change: `${metrics.enrollmentsCount} matrículas`,
      positive: true,
      hint: "no mês",
      icon: Target,
    },
    {
      label: "Ticket médio",
      value: formatCurrency(metrics.ticketAverage),
      change: `${metrics.enrollmentsCount} vendas`,
      positive: true,
      hint: "no mês",
      icon: Receipt,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((metric) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                {metric.label}
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
              {metric.value}
            </div>
            <div
              className={`mt-1 text-xs font-semibold ${
                metric.positive ? "text-green-600" : "text-red-600"
              }`}
            >
              {metric.change} {metric.hint}
            </div>
          </div>
        )
      })}
    </div>
  )
}
