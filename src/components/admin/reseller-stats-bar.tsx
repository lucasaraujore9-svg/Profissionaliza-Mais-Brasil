const STATS = [
  { label: "Total", value: "312", accent: "text-[#1A1A2E]" },
  { label: "Ativos", value: "278", accent: "text-emerald-600" },
  { label: "Pendentes", value: "22", accent: "text-amber-600" },
  { label: "Suspensos", value: "12", accent: "text-rose-600" },
]

export function ResellerStatsBar() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {stat.label}
          </p>
          <p className={`mt-2 font-mono text-2xl font-bold ${stat.accent}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}
