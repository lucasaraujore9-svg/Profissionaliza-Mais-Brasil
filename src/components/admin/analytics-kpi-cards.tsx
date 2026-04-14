const KPIS = [
  { label: "Novos revendedores", value: "42", change: "+18%", positive: true },
  { label: "Novos alunos", value: "1.284", change: "+12%", positive: true },
  { label: "Conversão checkout", value: "8,2%", change: "+1,4pp", positive: true },
  { label: "MRR média", value: "R$ 474", change: "+3,1%", positive: true },
  { label: "Churn", value: "2,6%", change: "-0,3pp", positive: true },
  { label: "LTV", value: "R$ 6.840", change: "+4,2%", positive: true },
]

export function AnalyticsKpiCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {KPIS.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {kpi.label}
          </p>
          <p className="mt-2 font-mono text-lg font-bold text-[#1A1A2E]">{kpi.value}</p>
          <p
            className={`mt-1 text-[11px] font-semibold ${
              kpi.positive ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {kpi.change}
          </p>
        </div>
      ))}
    </div>
  )
}
