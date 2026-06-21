"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FileSpreadsheet, FileText, Loader2, Search } from "lucide-react"

interface ReportPayload {
  id: string
  label: string
  group: string
  description: string
  header: string[]
  rows: unknown[][]
  filename: string
  totalRows: number
}

interface Props {
  type: string
  from: string | null
  to: string | null
}

const PAGE_SIZES = [25, 50, 100, 250]

export function ReportViewer({ type, from, to }: Props) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "pdf" | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ format: "json" })
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      try {
        const res = await fetch(`/api/admin/relatorios/${type}?${params}`)
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar relatório")
          return
        }
        setData(body.data as ReportPayload)
      } catch {
        setError("Erro de rede ao carregar relatório")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [type, from, to])

  const filteredRows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.rows
    return data.rows.filter((row) =>
      row.some((cell) => String(cell ?? "").toLowerCase().includes(q)),
    )
  }, [data, query])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = useMemo(() => {
    const start = safePage * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  async function exportCsv() {
    if (!data) return
    setExporting("csv")
    try {
      const csv =
        "﻿" +
        [data.header, ...filteredRows]
          .map((row) =>
            row
              .map((cell) => {
                const str = cell === null || cell === undefined ? "" : String(cell)
                if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`
                return str
              })
              .join(","),
          )
          .join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      triggerDownload(blob, `${data.filename}.csv`)
    } finally {
      setExporting(null)
    }
  }

  async function exportXlsx() {
    if (!data) return
    setExporting("xlsx")
    try {
      const ExcelJS = (await import("exceljs")).default
      const wb = new ExcelJS.Workbook()
      // Nome da aba: Excel limita a 31 chars e proíbe : \ / ? * [ ]
      const sheetName =
        data.label.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Relatório"
      const ws = wb.addWorksheet(sheetName)
      ws.columns = data.header.map((h) => ({ header: String(h), width: 18 }))
      for (const row of filteredRows) {
        ws.addRow(
          row.map((cell) => (cell === null || cell === undefined ? "" : cell)),
        )
      }
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      triggerDownload(blob, `${data.filename}.xlsx`)
    } finally {
      setExporting(null)
    }
  }

  async function exportPdf() {
    if (!data) return
    setExporting("pdf")
    try {
      const { jsPDF } = await import("jspdf")
      const autoTable = (await import("jspdf-autotable")).default
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })

      doc.setFontSize(14)
      doc.text(data.label, 40, 40)
      doc.setFontSize(9)
      doc.setTextColor(120)
      const subtitle = [
        data.group,
        from ? `de ${from}` : null,
        to ? `até ${to}` : null,
        `${filteredRows.length} linha(s)`,
      ]
        .filter(Boolean)
        .join(" · ")
      doc.text(subtitle, 40, 56)

      autoTable(doc, {
        startY: 72,
        head: [data.header],
        body: filteredRows.map((row) =>
          row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
        ),
        styles: { fontSize: 7, cellPadding: 4 },
        headStyles: {
          fillColor: [2, 89, 24],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 247, 245] },
        margin: { top: 72, right: 40, bottom: 40, left: 40 },
      })

      doc.save(`${data.filename}.pdf`)
    } finally {
      setExporting(null)
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Gerando relatório...
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

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-pmb-green)]">
              {data.group}
            </p>
            <h1 className="mt-1 font-display text-2xl text-[var(--color-pmb-green-900)]">
              {data.label}
            </h1>
            <p className="mt-1 text-xs text-gray-600">{data.description}</p>
            <p className="mt-2 text-[11px] text-gray-500">
              {data.totalRows} linha{data.totalRows === 1 ? "" : "s"}
              {(from || to) && (
                <>
                  {" · "}
                  {from ? `de ${from}` : ""}
                  {from && to ? " " : ""}
                  {to ? `até ${to}` : ""}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === "csv" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              CSV
            </button>
            <button
              type="button"
              onClick={exportXlsx}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              Excel
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {exporting === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              PDF
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrar resultados..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <label className="flex items-center gap-2">
              <span>Linhas por página</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {filteredRows.length === 0
                ? "0 resultados"
                : `${safePage * pageSize + 1}–${Math.min(filteredRows.length, (safePage + 1) * pageSize)} de ${filteredRows.length}`}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {data.header.map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap border-b border-gray-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.header.length}
                    className="px-3 py-10 text-center text-sm text-gray-500"
                  >
                    Nenhum resultado.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="whitespace-nowrap px-3 py-2 text-xs text-gray-700"
                      >
                        {cell === null || cell === undefined ? "—" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 p-4 text-xs">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-gray-600">
              Página {safePage + 1} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
