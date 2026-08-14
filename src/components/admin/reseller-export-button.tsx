"use client"

import { useState } from "react"
import { FileSpreadsheet, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { ResellerExportPayload } from "@/lib/admin/resellers/export-types"

interface Props {
  /** Filtros da tela — a planilha sai com o MESMO recorte que está à vista. */
  query: string
  status: string
}

export function ResellerExportButton({ query, status }: Props) {
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (status && status !== "TODOS") params.set("status", status)

      const res = await fetch(`/api/admin/revendedores/export?${params}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao gerar a planilha")
        return
      }
      const payload = body.data as ResellerExportPayload

      // O `exceljs` (≈1 MB) só entra no bundle de quem clica em exportar.
      const { buildResellerWorkbook } = await import(
        "@/lib/admin/resellers/workbook"
      )
      const buffer = await buildResellerWorkbook(payload)
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${payload.filename}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      const unidades = payload.sheets[0]?.rows.length ?? 0
      toast.success(
        `Planilha gerada com ${unidades} unidade${unidades === 1 ? "" : "s"}`,
      )
    } catch {
      toast.error("Erro ao gerar a planilha")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      {busy ? "Gerando…" : "Exportar Excel"}
    </button>
  )
}
