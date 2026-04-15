import { TrendingUp, Repeat, Users, Coins } from "lucide-react"

export interface AdminFinanceSummaryData {
  mrr: number
  arr: number
  churnRate: number
  ltv: number
  paidLast30: number
  paidChangePct: number
}

interface AdminFinanceSummaryProps {
  summary: AdminFinanceSummaryData
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

function formatPct(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`
}

export function AdminFinanceSummary({ summary }: AdminFinanceSummaryProps) {
  const cards = [
    {
      label: "MRR",
      value: formatMoney(summary.mrr),
      change: formatPct(summary.paidChangePct),
      icon: Repeat,
      gradient: "from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)]",
    },
    {
      label: "ARR (projetado)",
      value: formatMoney(summary.arr),
      change: "12x MRR",
      icon: TrendingUp,
      gradient: "from-emerald-500 to-teal-600",
    },
    {
      label: "Churn Rate",
      value: `${summary.churnRate.toFixed(1)}%`,
      change: "Acumulado",
      icon: Users,
      gradient: "from-rose-500 to-pink-600",
    },
    {
      label: "LTV médio",
      value: formatMoney(summary.ltv),
      change: "Base 24 meses",
      icon: Coins,
      gradient: "from-amber-500 to-orange-600",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className={`rounded-2xl bg-gradient-to-br p-5 text-white shadow-sm ${card.gradient}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/85">
                {card.label}
              </p>
              <Icon className="h-4 w-4 text-white/85" />
            </div>
            <p className="mt-3 font-mono text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-white/85">{card.change}</p>
          </div>
        )
      })}
    </div>
  )
}
