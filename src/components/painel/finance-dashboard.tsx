"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Download, AlertTriangle, RotateCcw, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/painel/page-header"
import { FinanceSplitCard, type SplitStatement } from "./finance-split-card"
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
  const [split, setSplit] = useState<SplitStatement | null>(null)
  const [week, setWeek] = useState<ChartPoint[]>([])
  const [month, setMonth] = useState<ChartPoint[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(startOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [status, setStatus] = useState<FinanceStatusFilter>("TODOS")
  const [type, setType] = useState<FinanceTypeFilter>("TODOS")

  // Primeira carga: ainda nao temos dados reais — evita o flash de "R$ 0".
  const isInitial = loading && metrics === emptyMetrics

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
      setSplit(body.data.split ?? null)
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
    if (type !== "TODOS") params.set("type", type)
    const url = `/api/painel/financeiro/export-csv?${params.toString()}`
    window.location.href = url
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe suas receitas, pagamentos e exporte relatórios."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/painel/relatorios/financeiro"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-gray-50"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Ver análise completa
            </Link>
            <Button
              data-tour="financeiro:exportar"
              variant="outline"
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        }
      />

      {error && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-pmb-terracotta)]/30 bg-[var(--color-pmb-terracotta-50)] px-4 py-3 text-sm text-[var(--color-pmb-terracotta)] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            className="border-[var(--color-pmb-terracotta)]/40 text-[var(--color-pmb-terracotta)] hover:bg-[var(--color-pmb-terracotta)]/10"
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      <div data-tour="financeiro:periodo">
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
      </div>
      <div data-tour="financeiro:resumo">
        <FinanceSummaryCards metrics={metrics} loading={isInitial} />

        {split && <FinanceSplitCard split={split} />}
      </div>
      <FinanceBarChart week={week} month={month} loading={isInitial} />
      <div data-tour="financeiro:transacoes">
        <FinancePaymentTable payments={payments} loading={loading} />
      </div>
    </div>
  )
}
