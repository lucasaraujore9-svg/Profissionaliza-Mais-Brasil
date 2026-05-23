import { TrendingUp, Repeat, Users, Coins } from "lucide-react"

export interface AdminFinanceSummaryData {
  mrr: number
  arr: number
  churnRate: number
  ltv: number
  paidLast30: number
  paidChangePct: number
}

interface AdminFinanceSummaryProps {
  summary: AdminFinanceSummaryData
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

function formatPct(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`
}

// Cores PMB padronizadas. Apenas o MRR destaca-se com gradiente verde da
// marca; os demais ficam em cards brancos com icone tonal — mantemos coesao
// com admin-metric-cards e o restante do admin.
export function AdminFinanceSummary({ summary }: AdminFinanceSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/85">
            MRR
          </p>
          <Repeat className="h-4 w-4 text-white/85" />
        </div>
        <p className="mt-3 font-mono text-2xl font-bold">{formatMoney(summary.mrr)}</p>
        <p className="mt-1 text-xs text-white/85">
          {formatPct(summary.paidChangePct)} vs período anterior
        </p>
      </div>

      <NeutralCard
        label="ARR (projetado)"
        value={formatMoney(summary.arr)}
        hint="12× MRR"
        icon={TrendingUp}
      />
      <NeutralCard
        label="Churn rate"
        value={`${summary.churnRate.toFixed(1)}%`}
        hint="Acumulado"
        icon={Users}
      />
      <NeutralCard
        label="LTV médio"
        value={formatMoney(summary.ltv)}
        hint="Base 24 meses"
        icon={Coins}
      />
    </div>
  )
}

interface NeutralCardProps {
  label: string
  value: string
  hint: string
  icon: typeof TrendingUp
}

function NeutralCard({ label, value, hint, icon: Icon }: NeutralCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  )
}
