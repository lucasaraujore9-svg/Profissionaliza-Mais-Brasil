"use client"

import { useCallback, useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  FinanceSummaryCards,
  type FinanceMetrics,
} from "./finance-summary-cards"
import {
  FinanceFilterBar,
  type FinanceStatusFilter,
  type FinanceTypeFilter,
} from "./finance-filter-bar"
import { FinanceBarChart, type ChartPoint } from "./finance-bar-chart"
import {
  FinancePaymentTable,
  type PaymentRow,
} from "./finance-payment-table"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function startOfMonthIso(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
}

const emptyMetrics: FinanceMetrics = {
  monthRevenue: 0,
  received: 0,
  pending: 0,
  toReceive: 0,
}

export function FinanceDashboard() {
  const [metrics, setMetrics] = useState<FinanceMetrics>(emptyMetrics)
  const [week, setWeek] = useState<ChartPoint[]>([])
  const [month, setMonth] = useState<ChartPoint[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(startOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [status, setStatus] = useState<FinanceStatusFilter>("TODOS")
  const [type, setType] = useState<FinanceTypeFilter>("TODOS")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (status !== "TODOS") params.set("status", status)
      if (type !== "TODOS") params.set("type", type)
      const res = await fetch(`/api/painel/financeiro?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar financeiro")
        return
      }
      setMetrics(body.data.metrics)
      setWeek(body.data.charts.week)
      setMonth(body.data.charts.month)
      setPayments(body.data.payments)
    } catch {
      setError("Erro de rede ao carregar financeiro")
    } finally {
      setLoading(false)
    }
  }, [from, to, status, type])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 250)
    return () => clearTimeout(timer)
  }, [load])

  function handleExport() {
    const params = new URLSearchParams()
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (status !== "TODOS") params.set("status", status)
    const url = `/api/painel/financeiro/export-csv?${params.toString()}`
    window.location.href = url
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <FinanceSummaryCards metrics={metrics} />
      <FinanceFilterBar
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        status={status}
        onStatusChange={setStatus}
        type={type}
        onTypeChange={setType}
      />
      <FinanceBarChart week={week} month={month} />
      <FinancePaymentTable payments={payments} loading={loading} />
    </div>
  )
}
