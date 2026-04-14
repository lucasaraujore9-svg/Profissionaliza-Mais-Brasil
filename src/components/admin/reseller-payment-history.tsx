export interface ResellerPayment {
  id: string
  asaasPaymentId: string
  amount: number
  billingType: string | null
  status: string
  dueDate: string
  paidAt: string | null
}

interface ResellerPaymentHistoryProps {
  payments: ResellerPayment[]
}

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-emerald-100 text-emerald-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  REFUNDED: "bg-gray-200 text-gray-600",
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "pago",
  CONFIRMED: "confirmado",
  PENDING: "pendente",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
}

const METHOD_LABEL: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão",
  UNDEFINED: "—",
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ResellerPaymentHistory({ payments }: ResellerPaymentHistoryProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Histórico de pagamentos</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Faturas da assinatura Asaas recentes.
        </p>
      </div>
      {payments.length === 0 ? (
        <div className="px-6 py-10 text-center text-xs text-gray-500">
          Nenhuma fatura registrada ainda.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Vencimento</th>
                <th className="px-6 py-3 font-medium">Valor</th>
                <th className="px-6 py-3 font-medium">Método</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const statusKey = p.status.toUpperCase()
                const methodKey = (p.billingType ?? "UNDEFINED").toUpperCase()
                return (
                  <tr key={p.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-6 py-3 font-mono text-xs text-gray-700">
                      {formatDate(p.dueDate)}
                    </td>
                    <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-600">
                      {METHOD_LABEL[methodKey] ?? methodKey}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_STYLES[statusKey] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {STATUS_LABEL[statusKey] ?? p.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
