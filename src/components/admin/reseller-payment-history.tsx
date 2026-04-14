const PAYMENTS = [
  { id: "pay_01", date: "08/04/2026", amount: "R$ 297,00", method: "PIX", status: "pago" },
  { id: "pay_02", date: "08/03/2026", amount: "R$ 297,00", method: "Boleto", status: "pago" },
  { id: "pay_03", date: "08/02/2026", amount: "R$ 297,00", method: "Cartão", status: "pago" },
  { id: "pay_04", date: "08/01/2026", amount: "R$ 297,00", method: "PIX", status: "pago" },
  { id: "pay_05", date: "08/12/2025", amount: "R$ 297,00", method: "Cartão", status: "pago" },
  { id: "pay_06", date: "08/11/2025", amount: "R$ 297,00", method: "Boleto", status: "pago" },
  { id: "pay_07", date: "08/10/2025", amount: "R$ 297,00", method: "PIX", status: "pendente" },
]

const STATUS_STYLES: Record<string, string> = {
  pago: "bg-emerald-100 text-emerald-700",
  pendente: "bg-amber-100 text-amber-700",
  cancelado: "bg-rose-100 text-rose-700",
}

export function ResellerPaymentHistory() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Histórico de pagamentos</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Faturas da assinatura Asaas nos últimos 12 meses.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Data</th>
              <th className="px-6 py-3 font-medium">Valor</th>
              <th className="px-6 py-3 font-medium">Método</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-6 py-3 font-mono text-xs text-gray-700">{p.date}</td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">{p.amount}</td>
                <td className="px-6 py-3 text-xs text-gray-600">{p.method}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[p.status]}`}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
