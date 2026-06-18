import { Wallet, CheckCircle2, Clock } from "lucide-react"
import { StatCardsSkeleton } from "@/components/shared/loading-skeletons"

export interface FinanceMetrics {
  monthRevenue: number
  received: number
  pending: number
  toReceive: number
}

interface FinanceSummaryCardsProps {
  metrics: FinanceMetrics
  loading?: boolean
}

// Mostra centavos para que o headline reconcilie com as linhas da tabela.
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

// Paleta PMB: destaque verde para a metrica primaria (Receita do mes),
// cards brancos com chip semantico nos complementares
// (Recebido=verde, Pendente=ouro, A receber=ciano).
export function FinanceSummaryCards({
  metrics,
  loading,
}: FinanceSummaryCardsProps) {
  if (loading) {
    return <StatCardsSkeleton count={4} className="xl:grid-cols-4" />
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider opacity-90">
            Receita do mês
          </span>
          <Wallet className="h-5 w-5 opacity-80" aria-hidden="true" />
        </div>
        <div className="mt-3 font-mono text-2xl font-bold">
          {formatCurrency(metrics.monthRevenue)}
        </div>
      </div>

      <NeutralFinanceCard
        label="Recebido"
        value={formatCurrency(metrics.received)}
        icon={CheckCircle2}
        tone="green"
      />
      <NeutralFinanceCard
        label="Pendente"
        value={formatCurrency(metrics.pending)}
        icon={Clock}
        tone="gold"
      />
      <NeutralFinanceCard
        label="A receber"
        value={formatCurrency(metrics.toReceive)}
        icon={Wallet}
        tone="cyan"
      />
    </div>
  )
}

type ChipTone = "green" | "gold" | "cyan"

const CHIP_TONE: Record<ChipTone, string> = {
  green: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]",
  gold: "bg-[var(--color-pmb-gold-50)] text-[var(--color-pmb-gold-600)]",
  cyan: "bg-[var(--color-pmb-cyan-50)] text-[var(--color-pmb-cyan-700)]",
}

interface NeutralFinanceCardProps {
  label: string
  value: string
  icon: typeof Wallet
  tone: ChipTone
}

function NeutralFinanceCard({
  label,
  value,
  icon: Icon,
  tone,
}: NeutralFinanceCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${CHIP_TONE[tone]}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {value}
      </div>
    </div>
  )
}
