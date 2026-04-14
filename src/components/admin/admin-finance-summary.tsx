import { TrendingUp, Repeat, Users, Coins } from "lucide-react"

const CARDS = [
  {
    label: "MRR Total",
    value: "R$ 148.320",
    change: "+12,4%",
    icon: Repeat,
    gradient: "from-blue-600 to-indigo-600",
  },
  {
    label: "ARR (projetado)",
    value: "R$ 1,78M",
    change: "+14,1%",
    icon: TrendingUp,
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    label: "Churn Rate",
    value: "2,6%",
    change: "-0,3pp",
    icon: Users,
    gradient: "from-rose-500 to-pink-600",
  },
  {
    label: "LTV médio",
    value: "R$ 6.840",
    change: "+4,2%",
    icon: Coins,
    gradient: "from-amber-500 to-orange-600",
  },
]

export function AdminFinanceSummary() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => {
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
            <p className="mt-1 text-xs text-white/85">{card.change} vs mês anterior</p>
          </div>
        )
      })}
    </div>
  )
}
