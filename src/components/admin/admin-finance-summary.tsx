import { TrendingUp, Repeat, Users, Coins } from "lucide-react"
import { formatMoney, formatPct } from "@/lib/admin/finance-format"

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

// Cores PMB padronizadas. Apenas o MRR destaca-se com gradiente verde da
// marca; os demais ficam em cards brancos com icone tonal — mantemos coesao
// com admin-metric-cards e o restante do admin.
export function AdminFinanceSummary({ summary }: AdminFinanceSummaryProps) {
  const churnHigh = summary.churnRate >= 5
  // Delta do MRR: queda é ruim (vermelho), alta é boa (verde claro sobre o hero).
  const deltaPositive = summary.paidChangePct >= 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/85">
            MRR
          </p>
          <Repeat className="h-4 w-4 text-white/85" />
        </div>
        <p className="mt-3 font-mono text-2xl font-bold">
          {formatMoney(summary.mrr, { cents: false })}
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs">
          <span
            className={`rounded-full px-1.5 py-0.5 font-mono font-semibold ${
              deltaPositive
                ? "bg-white/20 text-[var(--color-pmb-lime-100,#e6f4d8)]"
                : "bg-rose-500/30 text-rose-100"
            }`}
          >
            {formatPct(summary.paidChangePct)}
          </span>
          <span className="text-white/80">vs período anterior</span>
        </p>
      </div>

      <NeutralCard
        label="ARR (projetado)"
        value={formatMoney(summary.arr, { cents: false })}
        hint="12× MRR"
        icon={TrendingUp}
      />
      <NeutralCard
        label="Churn rate"
        value={`${summary.churnRate.toFixed(1)}%`}
        hint={churnHigh ? "Acima do saudável" : "Dentro do esperado"}
        icon={Users}
        tone={churnHigh ? "warn" : "good"}
      />
      <NeutralCard
        label="LTV médio"
        value={formatMoney(summary.ltv, { cents: false })}
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
  tone?: "good" | "warn"
}

const TONE_ICON: Record<NonNullable<NeutralCardProps["tone"]>, string> = {
  good: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]",
  warn: "bg-[var(--color-pmb-gold)]/15 text-[var(--color-pmb-gold-600)]",
}
const TONE_HINT: Record<NonNullable<NeutralCardProps["tone"]>, string> = {
  good: "text-gray-500",
  warn: "text-[var(--color-pmb-gold-600)]",
}

function NeutralCard({ label, value, hint, icon: Icon, tone }: NeutralCardProps) {
  const iconClass = tone
    ? TONE_ICON[tone]
    : "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]"
  const hintClass = tone ? TONE_HINT[tone] : "text-gray-500"
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {value}
      </p>
      <p className={`mt-1 text-xs ${hintClass}`}>{hint}</p>
    </div>
  )
}
