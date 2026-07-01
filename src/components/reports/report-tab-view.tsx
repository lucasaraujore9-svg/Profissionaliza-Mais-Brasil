"use client"

import type { ReportPayload } from "@/lib/reports/types"
import { KpiGrid } from "./kpi-grid"
import { DataTable } from "./data-table"
import { SeriesChart } from "./charts"
import { ReportSkeleton } from "./states"

/**
 * Renderizador genérico de um `ReportPayload`: KPIs → gráficos → tabelas.
 * A maioria das abas usa este componente direto; abas com layout especial
 * montam seu próprio painel reusando os mesmos blocos (KpiGrid/SeriesChart/DataTable).
 */
export function ReportTabView({
  payload,
  loading,
  error,
}: {
  payload: ReportPayload | null
  loading?: boolean
  error?: string | null
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }
  if (loading || !payload) return <ReportSkeleton />

  return (
    <div className="space-y-6">
      {payload.kpis.length > 0 && <KpiGrid kpis={payload.kpis} />}

      {payload.series.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {payload.series.map((s) => (
            <SeriesChart key={s.id} series={s} />
          ))}
        </div>
      )}

      {payload.tables.length > 0 && (
        <div className="space-y-6">
          {payload.tables.map((t) => (
            <DataTable key={t.id} table={t} />
          ))}
        </div>
      )}
    </div>
  )
}
