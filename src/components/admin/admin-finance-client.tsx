"use client"

import { useEffect, useState } from "react"
import {
  AdminFinanceSummary,
  type AdminFinanceSummaryData,
} from "./admin-finance-summary"
import {
  AdminPaymentList,
  type AdminPaymentRow,
} from "./admin-payment-list"
import {
  AdminOverdueSection,
  type AdminOverdueRow,
} from "./admin-overdue-section"

interface FinanceResponse {
  summary: AdminFinanceSummaryData
  payments: AdminPaymentRow[]
}

interface OverdueResponse {
  rows: AdminOverdueRow[]
  summary: { count: number; totalAmount: number }
}

export function AdminFinanceClient() {
  const [finance, setFinance] = useState<FinanceResponse | null>(null)
  const [overdue, setOverdue] = useState<OverdueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [fr, or] = await Promise.all([
          fetch("/api/admin/financeiro"),
          fetch("/api/admin/financeiro/overdue"),
        ])
        const [fb, ob] = await Promise.all([fr.json(), or.json()])
        if (!fr.ok) {
          setError(fb.error ?? "Falha ao carregar dados financeiros")
          return
        }
        if (!or.ok) {
          setError(ob.error ?? "Falha ao carregar inadimplência")
          return
        }
        setFinance(fb.data)
        setOverdue(ob.data)
      } catch {
        setError("Erro de rede ao carregar dados financeiros")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading && !finance) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando dados financeiros...
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }
  if (!finance || !overdue) return null

  return (
    <div className="space-y-6">
      <AdminFinanceSummary summary={finance.summary} />
      <AdminOverdueSection rows={overdue.rows} totalAmount={overdue.summary.totalAmount} />
      <AdminPaymentList payments={finance.payments} />
    </div>
  )
}
