export interface AnalyticsKpis {
  newResellers: number
  newStudents: number
  conversionRate: number
  avgMrr: number
  churn: number
  ltv: number
}

interface AnalyticsKpiCardsProps {
  kpis: AnalyticsKpis
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

function formatPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`
}

export function AnalyticsKpiCards({ kpis }: AnalyticsKpiCardsProps) {
  const items = [
    { label: "Novos revendedores", value: kpis.newResellers.toLocaleString("pt-BR") },
    { label: "Novos alunos", value: kpis.newStudents.toLocaleString("pt-BR") },
    { label: "Conversão checkout", value: formatPct(kpis.conversionRate) },
    { label: "MRR média", value: formatMoney(kpis.avgMrr) },
    { label: "Churn", value: formatPct(kpis.churn) },
    { label: "LTV", value: formatMoney(kpis.ltv) },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {kpi.label}
          </p>
          <p className="mt-2 font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">{kpi.value}</p>
        </div>
      ))}
    </div>
  )
}
