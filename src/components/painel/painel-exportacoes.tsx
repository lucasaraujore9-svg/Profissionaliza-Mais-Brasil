"use client"

import { useEffect, useState } from "react"
import { FileSpreadsheet } from "lucide-react"
import { ExportButton } from "@/components/reports/export-button"

interface PainelReportItem {
  id: string
  label: string
  description: string
}

/** Catálogo de exportações CSV da unidade (tenant-scoped no servidor). */
export function PainelExportacoes({ queryString }: { queryString: string }) {
  const [reports, setReports] = useState<PainelReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/painel/relatorios/export")
      .then(async (res) => {
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar exportações")
          return
        }
        setReports(body.data.reports ?? [])
      })
      .catch(() => {
        if (!cancelled) setError("Erro de rede ao carregar exportações")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando exportações...
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

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {reports.map((r) => {
        const qs = queryString ? `?${queryString}&format=csv` : "?format=csv"
        return (
          <div
            key={r.id}
            className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-1 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {r.label}
                </h4>
                <p className="mt-1 text-xs text-gray-600">{r.description}</p>
              </div>
            </div>
            <ExportButton href={`/api/painel/relatorios/export/${r.id}${qs}`} label="Baixar CSV" />
          </div>
        )
      })}
    </div>
  )
}
