"use client"

import { useState } from "react"
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Lock,
} from "lucide-react"

export interface InstallmentView {
  number: number
  amount: number
  dueDateISO: string
  status: "SCHEDULED" | "GENERATED" | "PAID" | "OVERDUE" | "CANCELLED"
  /** Boleto disponível para o aluno agora (janela de 7 dias / 1ª / vencida). */
  available: boolean
  /** Data (ISO) a partir da qual o boleto fica disponível — para as futuras. */
  availableFromISO: string | null
  invoiceUrl: string | null
  digitableLine: string | null
}

export interface InstallmentCarne {
  enrollmentId: string
  courseName: string
  parcelas: InstallmentView[]
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function InstallmentsSection({ carnes }: { carnes: InstallmentCarne[] }) {
  if (carnes.length === 0) return null

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Boletos do carnê
        </h2>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Cada parcela fica disponível a partir de 7 dias antes do vencimento. Pague
        o boleto para manter seu acesso ao curso.
      </p>

      <div className="mt-4 space-y-5">
        {carnes.map((carne) => (
          <div key={carne.enrollmentId}>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {carne.courseName}
            </h3>
            <ul className="mt-2 space-y-2">
              {carne.parcelas.map((p) => (
                <ParcelaRow key={p.number} parcela={p} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function ParcelaRow({ parcela }: { parcela: InstallmentView }) {
  const [copied, setCopied] = useState(false)

  async function copyLine() {
    if (!parcela.digitableLine) return
    await navigator.clipboard.writeText(parcela.digitableLine)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const isPaid = parcela.status === "PAID"
  const isOverdue = parcela.status === "OVERDUE"

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">
          Parcela {parcela.number} · {brl(parcela.amount)}
        </p>
        <p className="text-xs text-gray-500">
          Vencimento {shortDate(parcela.dueDateISO)}
          {isOverdue && !isPaid ? " · em atraso" : ""}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {isPaid ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Paga
          </span>
        ) : parcela.available && parcela.invoiceUrl ? (
          <>
            <a
              href={parcela.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white ${
                isOverdue
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-700)]"
              }`}
            >
              {isOverdue ? "Pagar boleto vencido" : "Ver boleto"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {parcela.digitableLine && (
              <button
                type="button"
                onClick={copyLine}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copiada" : "Copiar linha"}
              </button>
            )}
          </>
        ) : parcela.available ? (
          // Na janela mas boleto ainda em emissão (MP: gerado pelo cron).
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
            <Clock className="h-3 w-3" aria-hidden />
            Gerando boleto…
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200">
            <Lock className="h-3 w-3" aria-hidden />
            {parcela.availableFromISO
              ? `Disponível em ${shortDate(parcela.availableFromISO)}`
              : "Aguardando"}
          </span>
        )}
      </div>
    </li>
  )
}
