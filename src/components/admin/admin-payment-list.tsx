import Link from "next/link"
import { Receipt } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { FinanceStatusBadge } from "./finance-status"
import { formatDate, formatMoney } from "@/lib/admin/finance-format"

export interface AdminPaymentRow {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  amount: number
  billingType: string | null
  status: string
  dueDate: string
  paidAt: string | null
}

interface AdminPaymentListProps {
  payments: AdminPaymentRow[]
}

export function AdminPaymentList({ payments }: AdminPaymentListProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Pagamentos recentes
        </h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Últimas cobranças de assinaturas de revendedores.
        </p>
      </div>
      {payments.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Receipt}
            title="Nenhum pagamento registrado"
            description="As cobranças de assinaturas dos revendedores aparecerão aqui."
            className="border-none"
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Revendedor</th>
                <th className="px-6 py-3 font-medium">Valor</th>
                <th className="px-6 py-3 font-medium">Vencimento</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-3 font-medium text-[var(--color-pmb-green-900)]">
                    <Link
                      href={`/admin/revendedores/${p.tenantId}`}
                      className="hover:text-[var(--color-pmb-green)]"
                    >
                      {p.tenantName}
                    </Link>
                  </td>
                  <td className="px-6 py-3 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                    {formatMoney(p.amount)}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">
                    {formatDate(p.dueDate)}
                  </td>
                  <td className="px-6 py-3">
                    <FinanceStatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
