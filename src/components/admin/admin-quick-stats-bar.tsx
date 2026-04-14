export interface AdminQuickStats {
  newResellers7d: number
  newStudents7d: number
  processed7d: number
  activeCourses: number
}

interface AdminQuickStatsBarProps {
  stats: AdminQuickStats
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

export function AdminQuickStatsBar({ stats }: AdminQuickStatsBarProps) {
  const items = [
    { label: "Novos revendedores (7d)", value: stats.newResellers7d.toString() },
    { label: "Alunos matriculados (7d)", value: stats.newStudents7d.toString() },
    { label: "Pagamentos processados (7d)", value: formatCurrency(stats.processed7d) },
    { label: "Cursos ativos", value: stats.activeCourses.toString() },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="border-r border-white/20 pr-4 last:border-r-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/80">
              {item.label}
            </p>
            <p className="mt-1 font-mono text-xl font-bold">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
