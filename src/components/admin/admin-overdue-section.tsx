import Link from "next/link"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { formatMoney } from "@/lib/admin/finance-format"

export interface AdminOverdueRow {
  id: string
  tenantId: string
  tenantName: string
  amount: number
  daysLate: number
  dueDate: string
}

interface AdminOverdueSectionProps {
  rows: AdminOverdueRow[]
  totalAmount: number
}

/** Bucketiza o atraso em tons: recente=warning, >15d=danger. */
function daysLateBadge(days: number) {
  const tone = days >= 16 ? "danger" : "warning"
  return (
    <StatusBadge tone={tone} dot={false}>
      {days} {days === 1 ? "dia" : "dias"}
    </StatusBadge>
  )
}

export function AdminOverdueSection({ rows, totalAmount }: AdminOverdueSectionProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nenhuma inadimplência no momento"
        description="Todas as assinaturas de revendedores estão em dia."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Barra de acento à esquerda em vez de inundar o card inteiro de rosa. */}
      <div className="flex">
        <div className="w-1 shrink-0 bg-rose-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  Inadimplência
                </h3>
                <p className="mt-0.5 text-xs text-gray-600">
                  {rows.length} assinatura{rows.length === 1 ? "" : "s"} em atraso
                  somando{" "}
                  <span className="font-mono font-semibold text-rose-700">
                    {formatMoney(totalAmount)}
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3 font-medium">Revendedor</th>
                  <th className="px-6 py-3 font-medium">Dias de atraso</th>
                  <th className="px-6 py-3 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="px-6 py-3 font-medium text-[var(--color-pmb-green-900)]">
                      <Link
                        href={`/admin/revendedores/${o.tenantId}`}
                        className="hover:text-[var(--color-pmb-green)]"
                      >
                        {o.tenantName}
                      </Link>
                    </td>
                    <td className="px-6 py-3">{daysLateBadge(o.daysLate)}</td>
                    <td className="px-6 py-3 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                      {formatMoney(o.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
