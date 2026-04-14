export interface StudentStats {
  total: number
  ATIVO: number
  INATIVO: number
  BLOQUEADO: number
  DEVEDOR: number
  FORMADO: number
  INTERESSADO: number
}

interface StudentStatsBarProps {
  stats: StudentStats
}

export function StudentStatsBar({ stats }: StudentStatsBarProps) {
  const items = [
    { label: "Total", value: stats.total, color: "text-[#1A1A2E]" },
    { label: "Ativos", value: stats.ATIVO, color: "text-green-600" },
    { label: "Bloqueados", value: stats.BLOQUEADO, color: "text-red-600" },
    { label: "Inativos", value: stats.INATIVO, color: "text-gray-500" },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {stat.label}
          </div>
          <div className={`mt-2 font-mono text-2xl font-bold ${stat.color}`}>
            {stat.value.toLocaleString("pt-BR")}
          </div>
        </div>
      ))}
    </div>
  )
}
