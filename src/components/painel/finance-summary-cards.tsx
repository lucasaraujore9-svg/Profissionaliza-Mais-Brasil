import { Wallet, CheckCircle2, Clock, TrendingUp } from "lucide-react"

const cards = [
  {
    label: "Receita do mês",
    value: "R$ 48.720",
    icon: TrendingUp,
    color: "from-blue-600 to-indigo-600",
  },
  {
    label: "Recebido",
    value: "R$ 41.840",
    icon: CheckCircle2,
    color: "from-emerald-500 to-green-600",
  },
  {
    label: "Pendente",
    value: "R$ 4.280",
    icon: Clock,
    color: "from-amber-500 to-orange-500",
  },
  {
    label: "A receber",
    value: "R$ 2.600",
    icon: Wallet,
    color: "from-purple-500 to-fuchsia-600",
  },
] as const

export function FinanceSummaryCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-sm ${card.color}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider opacity-90">
                {card.label}
              </span>
              <Icon className="h-5 w-5 opacity-80" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold">
              {card.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}
