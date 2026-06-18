import { Receipt } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { TableRowsSkeleton } from "@/components/shared/loading-skeletons"
import { FinanceStatusBadge } from "./finance-status"

export interface PaymentRow {
  id: string
  date: string
  description: string
  amount: number
  status: string
  type: string
}

interface FinancePaymentTableProps {
  payments: PaymentRow[]
  loading?: boolean
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return "—"
  }
}

function TypePill({ type }: { type: string }) {
  const recurring = type === "MONTHLY"
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        recurring
          ? "bg-[var(--color-pmb-cyan-50)] text-[var(--color-pmb-cyan-700)] ring-[var(--color-pmb-cyan)]/25"
          : "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-700)] ring-[var(--color-pmb-green)]/15"
      }`}
    >
      {recurring ? "Recorrente" : "Único"}
    </span>
  )
}

export function FinancePaymentTable({
  payments,
  loading,
}: FinancePaymentTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Transações
        </h3>
        <span className="text-xs text-gray-500">
          {loading
            ? "Carregando..."
            : `Mostrando ${payments.length} ${
                payments.length === 1 ? "registro" : "registros"
              }`}
        </span>
      </div>

      {loading ? (
        <TableRowsSkeleton rows={6} cols={5} />
      ) : payments.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={Receipt}
            title="Nenhuma transação"
            description="Ajuste o período ou os filtros."
            className="border-0 py-10"
          />
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden overflow-x-auto md:block">
            <table className="hidden min-w-full divide-y divide-gray-200 md:table">
              <thead className="bg-[var(--color-pmb-mist)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Descrição
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-6 py-3 font-mono text-sm text-gray-600">
                      {formatDate(p.date)}
                    </td>
                    <td className="px-6 py-3 text-sm text-[var(--color-pmb-green-900)]">
                      {p.description}
                    </td>
                    <td className="px-6 py-3">
                      <TypePill type={p.type} />
                    </td>
                    <td className="px-6 py-3">
                      <FinanceStatusBadge status={p.status} />
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card-stack */}
          <ul className="divide-y divide-gray-100 md:hidden">
            {payments.map((p) => (
              <li key={p.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-pmb-green-900)]">
                      {p.description}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">
                      {formatDate(p.date)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {formatCurrency(p.amount)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <FinanceStatusBadge status={p.status} />
                  <TypePill type={p.type} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
