"use client"

import { useCallback, useEffect, useState } from "react"
import type { ReportPayload } from "@/lib/reports/types"
import { ReportShell, type ReportTabDef } from "@/components/reports/report-shell"
import { ReportTabView } from "@/components/reports/report-tab-view"
import { PeriodFilter } from "@/components/reports/period-filter"
import { useReportQueryState } from "@/components/reports/use-report-query-state"
import { ReportsClient } from "./reports-client"

/**
 * Consumidor do hub de BI do admin. Server component `[tab]/page.tsx` já validou
 * sessão + papel; aqui buscamos o payload da aba ativa e renderizamos o shell.
 * A aba "exportacoes" reusa o catálogo CSV (ReportsClient) em vez do BI.
 */
export function AdminRelatoriosClient({
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
      const res = await fetch(`/api/admin/relatorios/bi/${activeTab}?${queryString}`)
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
    // setTimeout: a busca (e seus setState) roda em callback assíncrono, não no
    // corpo síncrono do efeito — evita render em cascata e debounce troca de aba.
    const timer = setTimeout(() => {
      void load()
    }, 150)
    return () => clearTimeout(timer)
  }, [load, isExport])

  return (
    <ReportShell
      title="Relatórios"
      description="Painel de BI do ecossistema PMB — indicadores, gráficos e exportações."
      basePath="/admin/relatorios"
      tabs={tabs}
      activeTab={activeTab}
      queryString={queryString}
      filters={
        isExport ? undefined : <PeriodFilter value={period} onChange={setPeriod} />
      }
    >
      {isExport ? (
        <ReportsClient />
      ) : (
        <ReportTabView
          payload={payload}
          loading={loading}
          error={error}
          onRetry={load}
        />
      )}
    </ReportShell>
  )
}
