import { Wallet, CheckCircle2, Clock, TrendingUp } from "lucide-react"

export interface FinanceMetrics {
  monthRevenue: number
  received: number
  pending: number
  toReceive: number
}

interface FinanceSummaryCardsProps {
  metrics: FinanceMetrics
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

// Paleta PMB: destaque verde para a metrica primaria (Receita do mes),
// cards brancos com icone tonal para os complementares. Mantemos coerencia
// visual com o restante do painel/admin.
export function FinanceSummaryCards({ metrics }: FinanceSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider opacity-90">
            Receita do mês
          </span>
          <TrendingUp className="h-5 w-5 opacity-80" />
        </div>
        <div className="mt-3 font-mono text-2xl font-bold">
          {formatCurrency(metrics.monthRevenue)}
        </div>
      </div>

      <NeutralFinanceCard
        label="Recebido"
        value={formatCurrency(metrics.received)}
        icon={CheckCircle2}
      />
      <NeutralFinanceCard
        label="Pendente"
        value={formatCurrency(metrics.pending)}
        icon={Clock}
      />
      <NeutralFinanceCard
        label="A receber"
        value={formatCurrency(metrics.toReceive)}
        icon={Wallet}
      />
    </div>
  )
}

interface NeutralFinanceCardProps {
  label: string
  value: string
  icon: typeof Wallet
}

function NeutralFinanceCard({ label, value, icon: Icon }: NeutralFinanceCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {value}
      </div>
    </div>
  )
}
