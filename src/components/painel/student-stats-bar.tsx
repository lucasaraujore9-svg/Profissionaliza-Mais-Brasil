export interface StudentStats {
  total: number
  ATIVO: number
  PENDENTE: number
  INATIVO: number
  BLOQUEADO: number
  DEVEDOR: number
  FORMADO: number
  INTERESSADO: number
}

interface StudentStatsBarProps {
  stats: StudentStats
}

// Cores alinhadas aos tons do sistema de design PMB (status-badge):
// success=verde, warning=ouro, danger=vermelho, accent=lima, info=ciano, neutral=cinza.
const TONE_TEXT = {
  total: "text-[var(--color-pmb-green-900)]",
  success: "text-[var(--color-pmb-green-700)]",
  warning: "text-[var(--color-pmb-gold-600)]",
  danger: "text-rose-700",
  accent: "text-[var(--color-pmb-green-700)]",
  info: "text-[var(--color-pmb-cyan-700)]",
  neutral: "text-gray-500",
} as const

export function StudentStatsBar({ stats }: StudentStatsBarProps) {
  // Expoe TODOS os status que a tabela pode exibir — sem exibicao-sem-filtro.
  const items = [
    { label: "Total", value: stats.total, color: TONE_TEXT.total },
    { label: "Ativos", value: stats.ATIVO, color: TONE_TEXT.success },
    { label: "Pendentes", value: stats.PENDENTE, color: TONE_TEXT.warning },
    { label: "Devedores", value: stats.DEVEDOR, color: TONE_TEXT.warning },
    { label: "Bloqueados", value: stats.BLOQUEADO, color: TONE_TEXT.danger },
    { label: "Formados", value: stats.FORMADO, color: TONE_TEXT.accent },
    { label: "Interessados", value: stats.INTERESSADO, color: TONE_TEXT.info },
    { label: "Inativos", value: stats.INATIVO, color: TONE_TEXT.neutral },
  ]

  return (
    <div
      data-tour="alunos:stats"
      className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8"
    >
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
