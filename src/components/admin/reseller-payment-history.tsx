"use client"

import { useState } from "react"
import { ExternalLink, Trash2 } from "lucide-react"

export interface ResellerPayment {
  id: string
  asaasPaymentId: string
  amount: number
  billingType: string | null
  status: string
  dueDate: string
  paidAt: string | null
  invoiceUrl: string | null
  bankSlipUrl: string | null
}

interface ResellerPaymentHistoryProps {
  tenantId: string
  payments: ResellerPayment[]
  onRefresh?: () => void
}

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-emerald-100 text-emerald-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  REFUNDED: "bg-gray-200 text-gray-600",
  DELETED: "bg-gray-100 text-gray-400",
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "pago",
  CONFIRMED: "confirmado",
  PENDING: "pendente",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
  DELETED: "cancelado",
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

export function ResellerPaymentHistory({
  tenantId,
  payments,
  onRefresh,
}: ResellerPaymentHistoryProps) {
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function handleCancel(paymentId: string) {
    if (!confirm("Cancelar esta cobrança? Esta ação não pode ser desfeita.")) return
    setCancelling(paymentId)
    setCancelError(null)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/payments/${paymentId}`,
        { method: "DELETE" },
      )
      const body = await res.json()
      if (!res.ok) {
        setCancelError(body.error ?? "Falha ao cancelar cobrança")
        return
      }
      onRefresh?.()
    } catch {
      setCancelError("Erro de rede ao cancelar cobrança")
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Histórico de pagamentos
        </h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Faturas recentes da assinatura.
        </p>
      </div>

      {cancelError && (
        <div className="mx-6 mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {cancelError}
        </div>
      )}

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
                <th className="px-6 py-3 font-medium">Link</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const statusKey = p.status.toUpperCase()
                const methodKey = (p.billingType ?? "UNDEFINED").toUpperCase()
                const paymentLink = p.invoiceUrl ?? p.bankSlipUrl
                const isPending = statusKey === "PENDING" || statusKey === "OVERDUE"
                const isCancellable = statusKey === "PENDING" || statusKey === "OVERDUE"
                const isLoading = cancelling === p.asaasPaymentId
                return (
                  <tr key={p.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-6 py-3 font-mono text-xs text-gray-700">
                      {formatDate(p.dueDate)}
                    </td>
                    <td className="px-6 py-3 font-mono font-semibold text-[var(--color-pmb-green-900)]">
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
                    <td className="px-6 py-3">
                      {paymentLink ? (
                        <a
                          href={paymentLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                            isPending
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {isPending ? "Enviar link" : "Ver fatura"}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {isCancellable && (
                        <button
                          type="button"
                          onClick={() => handleCancel(p.asaasPaymentId)}
                          disabled={isLoading}
                          title="Cancelar cobrança"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          {isLoading ? "..." : "Cancelar"}
                        </button>
                      )}
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
