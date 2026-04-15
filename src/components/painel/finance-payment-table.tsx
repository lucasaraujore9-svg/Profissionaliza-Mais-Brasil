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

const statusLabels: Record<string, string> = {
  APPROVED: "Pago",
  PENDING: "Pendente",
  REJECTED: "Rejeitado",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
  IN_PROCESS: "Em análise",
  CHARGED_BACK: "Chargeback",
}

const statusColors: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  REJECTED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-700",
  CANCELLED: "bg-red-100 text-red-700",
  IN_PROCESS: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-700)]",
  CHARGED_BACK: "bg-red-100 text-red-700",
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

export function FinancePaymentTable({
  payments,
  loading,
}: FinancePaymentTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Transações</h3>
        <span className="text-xs text-gray-500">
          {loading
            ? "Carregando..."
            : `Mostrando ${payments.length} ${
                payments.length === 1 ? "registro" : "registros"
              }`}
        </span>
      </div>
      {loading ? (
        <div className="p-10 text-center text-sm text-gray-500">
          Carregando transações...
        </div>
      ) : payments.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-500">
          Nenhuma transação encontrada no período.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Descrição</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-sm text-gray-600">
                    {formatDate(p.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-pmb-green-900)]">
                    {p.description}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        statusColors[p.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {statusLabels[p.status] ?? p.status}
                    </span>
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
