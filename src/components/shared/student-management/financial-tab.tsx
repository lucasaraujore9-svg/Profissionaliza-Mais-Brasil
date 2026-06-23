"use client"

import { useState } from "react"
import { Check, CheckCircle2, Clock, Copy, ExternalLink, XCircle } from "lucide-react"
import type { StudentData } from "./types"

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR")
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "ACTIVE":
    case "APPROVED":
      return {
        label: "Aprovado",
        className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      }
    case "PENDING":
    case "IN_PROCESS":
      return {
        label: "Pendente",
        className: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
      }
    case "COMPLETED":
      return {
        label: "Concluído",
        className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
      }
    case "SUSPENDED":
      return {
        label: "Suspenso",
        className: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
      }
    case "CANCELLED":
    case "REJECTED":
    case "REFUNDED":
      return {
        label: status === "REFUNDED" ? "Estornado" : "Cancelado",
        className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
      }
    default:
      return {
        label: status,
        className: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
      }
  }
}

function statusIcon(status: string) {
  if (status === "ACTIVE" || status === "APPROVED" || status === "COMPLETED") {
    return CheckCircle2
  }
  if (status === "PENDING" || status === "IN_PROCESS") return Clock
  return XCircle
}

/**
 * Botão para copiar/abrir o link de checkout de uma cobrança pendente, para que
 * admin (sistema mãe) ou revenda reenviem ao aluno (venda direta aguardando
 * pagamento ou carrinho abandonado).
 */
function CheckoutLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        title={url}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition ${
          copied
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-white text-[var(--color-pmb-green-900)] ring-gray-200 hover:bg-gray-50"
        }`}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copiado" : "Copiar link"}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir checkout"
        className="inline-flex items-center rounded-md bg-white px-1.5 py-1 text-gray-500 ring-1 ring-gray-200 transition hover:bg-gray-50 hover:text-[var(--color-pmb-green-900)]"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}

export function FinancialTab({ student }: { student: StudentData }) {
  return (
    <div className="space-y-6">
      {/* Matrículas */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Matrículas ({student.enrollments.length})
          </h2>
        </header>
        {student.enrollments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Nenhuma matrícula.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2 font-semibold">Curso</th>
                  <th className="px-4 py-2 font-semibold">Tipo</th>
                  <th className="px-4 py-2 font-semibold">Gateway</th>
                  <th className="px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Início</th>
                  <th className="px-4 py-2 font-semibold">Checkout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {student.enrollments.map((e) => {
                  const badge = statusBadge(e.status)
                  const Icon = statusIcon(e.status)
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-3 font-medium text-[var(--color-pmb-green-900)]">
                        {e.courseName}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {e.paymentType === "MONTHLY" ? "Mensal" : "Único"}
                        {e.installmentsTotal && (
                          <span className="ml-1 text-gray-400">
                            ({e.installmentsPaid}/{e.installmentsTotal})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {e.gateway === "ASAAS" ? "Asaas" : "Mercado Pago"}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {brl(e.finalAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                        >
                          <Icon className="h-3 w-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {formatDate(e.startedAt ?? e.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {e.checkoutUrl ? (
                          <CheckoutLink url={e.checkoutUrl} />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagamentos */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Histórico de pagamentos ({student.payments.length})
          </h2>
          <span className="font-mono text-xs font-semibold text-[var(--color-pmb-green-900)]">
            Total: {brl(student.totalPaid)}
          </span>
        </header>
        {student.payments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Nenhum pagamento registrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2 font-semibold">Data</th>
                  <th className="px-4 py-2 font-semibold">Curso</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {student.payments.map((p) => {
                  const badge = statusBadge(p.status)
                  const Icon = statusIcon(p.status)
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {formatDate(p.paidAt ?? p.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm">{p.courseName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                        >
                          <Icon className="h-3 w-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {brl(p.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
