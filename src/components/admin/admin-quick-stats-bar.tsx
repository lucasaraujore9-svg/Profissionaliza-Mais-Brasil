const STATS = [
  { label: "Novos revendedores (7d)", value: "18" },
  { label: "Alunos matriculados (7d)", value: "487" },
  { label: "Pagamentos processados", value: "R$ 32.410" },
  { label: "Cursos ativos", value: "42" },
]

export function AdminQuickStatsBar() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="border-r border-white/20 pr-4 last:border-r-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/80">
              {stat.label}
            </p>
            <p className="mt-1 font-mono text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
