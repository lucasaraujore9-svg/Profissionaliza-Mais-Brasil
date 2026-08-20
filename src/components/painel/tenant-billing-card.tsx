import Link from "next/link"
import { ArrowRight, CheckCircle2, ReceiptText } from "lucide-react"
import type { TenantBillingSummary } from "@/lib/tenant-billing/types"
import { payUrlFor } from "@/lib/tenant-billing/types"
import {
  URGENCY_STYLE,
  billingTypeLabel,
  dueLabel,
  formatDueDate,
  formatMoney,
} from "./charge-presentation"

/**
 * Card de mensalidade no dashboard da unidade. Fica no topo porque é a única
 * pendência que pode derrubar a operação inteira (unidade suspensa = vitrine
 * fora do ar e alunos bloqueados) — e antes disso não havia nenhum lugar no
 * painel onde a unidade pudesse ver o próprio boleto.
 */
export function TenantBillingCard({ summary }: { summary: TenantBillingSummary }) {
  const next = summary.next
  const nextPayUrl = next ? payUrlFor(next) : null

  if (!next) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Mensalidade em dia
          </p>
          <p className="text-xs text-gray-600">
            Nenhuma cobrança em aberto com a PMB.
          </p>
        </div>
        <Link
          href="/painel/cobrancas"
          className="shrink-0 text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
        >
          Ver cobranças
        </Link>
      </div>
    )
  }

  const style = URGENCY_STYLE[next.urgency]
  const extra = summary.openCount - 1

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${style.ring}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-[var(--color-pmb-green-900)]">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                {next.urgency === "overdue"
                  ? "Mensalidade vencida"
                  : "Mensalidade a vencer"}
              </p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
              >
                {dueLabel(next.daysUntilDue)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-700">
              <strong className="text-[var(--color-pmb-green-900)]">
                {formatMoney(next.amount)}
              </strong>{" "}
              · {billingTypeLabel(next.billingType)} · vencimento{" "}
              {formatDueDate(next.dueDate)}
              {extra > 0
                ? ` · +${extra} outra${extra === 1 ? "" : "s"} em aberto`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/painel/cobrancas"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-900)]"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {nextPayUrl && (
            <Link
              href={nextPayUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
            >
              Pagar agora
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
