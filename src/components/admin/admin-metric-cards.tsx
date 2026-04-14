import { DollarSign, Users, GraduationCap, AlertTriangle } from "lucide-react"

const METRICS = [
  {
    label: "Receita Total (MRR)",
    value: "R$ 148.320",
    change: "+12,4%",
    positive: true,
    icon: DollarSign,
    accent: "bg-blue-50 text-blue-600",
  },
  {
    label: "Revendedores ativos",
    value: "312",
    change: "+18",
    positive: true,
    icon: Users,
    accent: "bg-emerald-50 text-emerald-600",
  },
  {
    label: "Alunos matriculados",
    value: "24.875",
    change: "+6,2%",
    positive: true,
    icon: GraduationCap,
    accent: "bg-indigo-50 text-indigo-600",
  },
  {
    label: "Inadimplência",
    value: "4,8%",
    change: "+0,6pp",
    positive: false,
    icon: AlertTriangle,
    accent: "bg-rose-50 text-rose-600",
  },
]

export function AdminMetricCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {METRICS.map((metric) => {
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
              {metric.change} <span className="text-gray-500 font-normal">vs mês anterior</span>
            </p>
          </div>
        )
      })}
    </div>
  )
}
