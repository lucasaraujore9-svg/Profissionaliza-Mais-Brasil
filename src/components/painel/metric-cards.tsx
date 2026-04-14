import { TrendingUp, Users, Target, Receipt } from "lucide-react"

const metrics = [
  {
    label: "Receita do mês",
    value: "R$ 48.720",
    change: "+12,4%",
    positive: true,
    icon: TrendingUp,
  },
  {
    label: "Alunos novos",
    value: "182",
    change: "+8,1%",
    positive: true,
    icon: Users,
  },
  {
    label: "Taxa de conversão",
    value: "4,7%",
    change: "-0,3%",
    positive: false,
    icon: Target,
  },
  {
    label: "Ticket médio",
    value: "R$ 267",
    change: "+4,2%",
    positive: true,
    icon: Receipt,
  },
] as const

export function MetricCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
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
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono text-2xl font-bold text-[#1A1A2E]">
              {metric.value}
            </div>
            <div
              className={`mt-1 text-xs font-semibold ${
                metric.positive ? "text-green-600" : "text-red-600"
              }`}
            >
              {metric.change} vs mês anterior
            </div>
          </div>
        )
      })}
    </div>
  )
}
