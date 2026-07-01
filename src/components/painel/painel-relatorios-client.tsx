"use client"

import { useCallback, useEffect, useState } from "react"
import type { ReportPayload } from "@/lib/reports/types"
import { ReportShell, type ReportTabDef } from "@/components/reports/report-shell"
import { ReportTabView } from "@/components/reports/report-tab-view"
import { PeriodFilter } from "@/components/reports/period-filter"
import { useReportQueryState } from "@/components/reports/use-report-query-state"
import { PainelExportacoes } from "./painel-exportacoes"

/**
 * Consumidor do hub de BI do painel (revenda). O server component já validou
 * sessão + gate de aba (owner). Aqui buscamos o payload tenant-scoped e
 * renderizamos o shell. "exportacoes" reusa o catálogo CSV da unidade.
 */
export function PainelRelatoriosClient({
  tabs,
  activeTab,
}: {
  tabs: ReportTabDef[]
  activeTab: string
}) {
  const { period, setPeriod, queryString } = useReportQueryState()
  const [payload, setPayload] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isExport = activeTab === "exportacoes"

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/painel/relatorios/bi/${activeTab}?${queryString}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar o relatório")
        setPayload(null)
        return
      }
      setPayload(body.data as ReportPayload)
    } catch {
      setError("Erro de rede ao carregar o relatório")
    } finally {
      setLoading(false)
    }
  }, [activeTab, queryString])

  useEffect(() => {
    if (isExport) return
    const timer = setTimeout(() => {
      void load()
    }, 150)
    return () => clearTimeout(timer)
  }, [load, isExport])

  return (
    <ReportShell
      title="Relatórios"
      description="BI da sua unidade — indicadores, gráficos e exportações."
      basePath="/painel/relatorios"
      tabs={tabs}
      activeTab={activeTab}
      queryString={queryString}
      filters={isExport ? undefined : <PeriodFilter value={period} onChange={setPeriod} />}
    >
      {isExport ? (
        <PainelExportacoes queryString={queryString} />
      ) : (
        <ReportTabView payload={payload} loading={loading} error={error} />
      )}
    </ReportShell>
  )
}
