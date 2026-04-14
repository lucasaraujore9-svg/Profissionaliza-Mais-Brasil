import Link from "next/link"
import { AlertTriangle } from "lucide-react"

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

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function AdminOverdueSection({ rows, totalAmount }: AdminOverdueSectionProps) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 shadow-sm">
      <div className="flex items-center justify-between border-b border-rose-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-rose-900">Inadimplência</h3>
            <p className="mt-0.5 text-xs text-rose-800/80">
              {rows.length} assinatura{rows.length === 1 ? "" : "s"} em atraso somando{" "}
              {formatMoney(totalAmount)}.
            </p>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-8 text-center text-xs text-rose-800/80">
          Nenhuma inadimplência registrada no momento.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rose-100 text-left text-xs uppercase tracking-wide text-rose-700/80">
                <th className="px-6 py-3 font-medium">Revendedor</th>
                <th className="px-6 py-3 font-medium">Dias de atraso</th>
                <th className="px-6 py-3 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-rose-100 last:border-b-0">
                  <td className="px-6 py-3 font-medium text-[#1A1A2E]">
                    <Link
                      href={`/admin/revendedores/${o.tenantId}`}
                      className="hover:text-blue-600"
                    >
                      {o.tenantName}
                    </Link>
                  </td>
                  <td className="px-6 py-3 font-mono text-rose-700">
                    {o.daysLate} dias
                  </td>
                  <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">
                    {formatMoney(o.amount)}
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
