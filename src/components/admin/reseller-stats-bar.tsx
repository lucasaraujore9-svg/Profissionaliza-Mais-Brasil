export interface ResellerStats {
  total: number
  active: number
  pending: number
  suspended: number
  cancelled: number
  /** Fora do ar E nunca pagou — separado de "Suspensos" (ver lifecycle.ts). */
  nuncaAtivou: number
}

interface ResellerStatsBarProps {
  stats: ResellerStats
}

export function ResellerStatsBar({ stats }: ResellerStatsBarProps) {
  const items = [
    { label: "Total", value: stats.total, accent: "text-[var(--color-pmb-green-900)]" },
    { label: "Ativos", value: stats.active, accent: "text-[var(--color-pmb-green-700)]" },
    { label: "Pendentes", value: stats.pending, accent: "text-[var(--color-pmb-gold-600)]" },
    { label: "Suspensos", value: stats.suspended, accent: "text-rose-600" },
    {
      label: "Nunca ativou",
      value: stats.nuncaAtivou,
      accent: "text-gray-500",
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {stat.label}
          </p>
          <p className={`mt-2 font-mono text-2xl font-bold ${stat.accent}`}>
            {stat.value.toLocaleString("pt-BR")}
          </p>
        </div>
      ))}
    </div>
  )
}
