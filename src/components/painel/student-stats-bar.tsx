const stats = [
  { label: "Total", value: "1.284", color: "text-[#1A1A2E]" },
  { label: "Ativos", value: "1.086", color: "text-green-600" },
  { label: "Bloqueados", value: "142", color: "text-red-600" },
  { label: "Inativos", value: "56", color: "text-gray-500" },
] as const

export function StudentStatsBar() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {stat.label}
          </div>
          <div className={`mt-2 font-mono text-2xl font-bold ${stat.color}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
