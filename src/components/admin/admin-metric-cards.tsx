import { DollarSign, Users, GraduationCap, AlertTriangle } from "lucide-react"

export interface AdminMetrics {
  revenue: number
  revenueChangePct: number
  activeResellers: number
  newResellers7d: number
  totalStudents: number
  studentsChangePct: number
  overdueRate: number
  overdueCount: number
}

interface AdminMetricCardsProps {
  metrics: AdminMetrics
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

export function AdminMetricCards({ metrics }: AdminMetricCardsProps) {
  const cards = [
    {
      label: "Receita no período",
      value: formatCurrency(metrics.revenue),
      change: formatPct(metrics.revenueChangePct),
      positive: metrics.revenueChangePct >= 0,
      icon: DollarSign,
      accent: "bg-blue-50 text-blue-600",
    },
    {
      label: "Revendedores ativos",
      value: metrics.activeResellers.toLocaleString("pt-BR"),
      change: `+${metrics.newResellers7d} (7d)`,
      positive: metrics.newResellers7d >= 0,
      icon: Users,
      accent: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Alunos matriculados",
      value: metrics.totalStudents.toLocaleString("pt-BR"),
      change: formatPct(metrics.studentsChangePct),
      positive: metrics.studentsChangePct >= 0,
      icon: GraduationCap,
      accent: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Inadimplência",
      value: `${metrics.overdueRate.toFixed(1)}%`,
      change: `${metrics.overdueCount} em atraso`,
      positive: metrics.overdueRate <= 5,
      icon: AlertTriangle,
      accent: "bg-rose-50 text-rose-600",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((metric) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {metric.label}
              </p>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${metric.accent}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 font-mono text-2xl font-bold text-[#1A1A2E]">
              {metric.value}
            </p>
            <p
              className={`mt-1 text-xs font-semibold ${
                metric.positive ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {metric.change}
            </p>
          </div>
        )
      })}
    </div>
  )
}
