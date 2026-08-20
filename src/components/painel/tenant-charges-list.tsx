import Link from "next/link"
import { Download, ExternalLink, FileText, ReceiptText } from "lucide-react"
import type { TenantBillingSummary, TenantCharge } from "@/lib/tenant-billing/types"
import { installmentLabel, payUrlFor } from "@/lib/tenant-billing/types"
import { EmptyState } from "@/components/shared/empty-state"
import {
  URGENCY_STYLE,
  billingTypeLabel,
  dueLabel,
  formatDueDate,
  formatMoney,
  statusLabel,
} from "./charge-presentation"

function SummaryCards({ summary }: { summary: TenantBillingSummary }) {
  const cards = [
    {
      label: "Em aberto",
      value: formatMoney(summary.openAmount),
      hint:
        summary.openCount === 1
          ? "1 cobrança aguardando pagamento"
          : `${summary.openCount} cobranças aguardando pagamento`,
      tone: "neutral" as const,
    },
    {
      label: "Vencidas",
      value: formatMoney(summary.overdueAmount),
      hint:
        summary.overdueCount === 0
          ? "Nenhuma cobrança em atraso"
          : summary.overdueCount === 1
            ? "1 cobrança em atraso"
            : `${summary.overdueCount} cobranças em atraso`,
      tone: summary.overdueCount > 0 ? ("danger" as const) : ("neutral" as const),
    },
    {
      label: "Próximo vencimento",
      value: summary.next ? formatDueDate(summary.next.dueDate) : "—",
      hint: summary.next
        ? `${dueLabel(summary.next.daysUntilDue)} · ${formatMoney(summary.next.amount)}`
        : "Nada a pagar no momento",
      tone:
        summary.next && summary.next.urgency !== "scheduled"
          ? ("warning" as const)
          : ("neutral" as const),
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl border p-5 shadow-sm ${
            card.tone === "danger"
              ? "border-rose-200 bg-rose-50"
              : card.tone === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-gray-200 bg-white"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {card.label}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-[var(--color-pmb-green-900)]">
            {card.value}
          </p>
          <p className="mt-1 text-xs text-gray-600">{card.hint}</p>
        </div>
      ))}
    </div>
  )
}

function ChargeRow({ charge, payable }: { charge: TenantCharge; payable: boolean }) {
  const payUrl = payUrlFor(charge)
  const style = URGENCY_STYLE[charge.urgency]
  return (
    <li className={`rounded-xl border p-4 ${payable ? style.ring : "border-gray-200 bg-white"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-[var(--color-pmb-green-900)]">
              {formatMoney(charge.amount)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                payable ? style.badge : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {statusLabel(charge)}
            </span>
            <span className="text-[11px] text-gray-500">
              {billingTypeLabel(charge.billingType)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Vencimento {formatDueDate(charge.dueDate)}
            {payable ? ` · ${dueLabel(charge.daysUntilDue)}` : ""}
            {!payable && charge.paidAt
              ? ` · Pago em ${new Date(charge.paidAt).toLocaleDateString("pt-BR")}`
              : ""}
          </p>
        </div>

        {payable && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {charge.bankSlipUrl && (
              <a
                href={charge.bankSlipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-900)]"
              >
                <Download className="h-3.5 w-3.5" />
                Boleto
              </a>
            )}
            {charge.invoiceUrl && (
              <a
                href={charge.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-900)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Fatura
              </a>
            )}
            {payUrl ? (
              <Link
                href={payUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
              >
                <ReceiptText className="h-3.5 w-3.5" />
                Pagar agora
              </Link>
            ) : (
              // Mensalidade já parcelada no cartão: o valor cheio foi
              // autorizado na compra e não há segunda via a emitir.
              charge.installment && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <ReceiptText className="h-3.5 w-3.5" />
                  {installmentLabel(charge.installment)}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export function TenantChargesList({ summary }: { summary: TenantBillingSummary }) {
  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} />

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Cobranças em aberto
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Mensalidades da sua unidade ainda não pagas. Pague por PIX, boleto ou
          cartão sem sair do sistema.
        </p>

        {summary.open.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={FileText}
              title="Nenhuma cobrança em aberto"
              description="Você está em dia com a PMB. Quando uma nova mensalidade for gerada, ela aparece aqui e você recebe um aviso 5 dias antes do vencimento."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {summary.open.map((charge) => (
              <ChargeRow key={charge.id} charge={charge} payable />
            ))}
          </ul>
        )}
      </section>

      {summary.paid.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Histórico de pagamentos
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Últimas mensalidades quitadas.
          </p>
          <ul className="mt-4 space-y-3">
            {summary.paid.map((charge) => (
              <ChargeRow key={charge.id} charge={charge} payable={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
