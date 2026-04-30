"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Loader2, FileSpreadsheet } from "lucide-react"

interface ReportItem {
  id: string
  group: string
  label: string
  description: string
}

const GROUP_ICONS: Record<string, string> = {
  Vendas: "💼",
  Alunos: "🎓",
  Revendedores: "🏪",
  Financeiro: "💰",
  Catálogo: "📚",
}

export function ReportsClient() {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [downloading, setDownloading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/relatorios")
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar relatórios")
          return
        }
        setReports(body.data.reports ?? [])
      } catch {
        setError("Erro de rede ao carregar relatórios")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, ReportItem[]>()
    for (const r of reports) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group)!.push(r)
    }
    return [...map.entries()]
  }, [reports])

  async function download(id: string) {
    setDownloading(id)
    setFeedback(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const url = `/api/admin/relatorios/${id}${params.toString() ? `?${params}` : ""}`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setFeedback(body?.error ?? "Falha ao gerar relatório")
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="(.+?)"/)
      const filename = match?.[1] ?? `${id}.csv`

      const a = document.createElement("a")
      const objectUrl = URL.createObjectURL(blob)
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      setFeedback(`Relatório ${filename} baixado com sucesso.`)
    } catch {
      setFeedback("Erro de rede ao baixar relatório")
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando relatórios...
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Filtros (opcionais)
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Aplicam-se aos relatórios que olham período. Em branco = histórico completo.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-700">De</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">Até</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setFrom("")
              setTo("")
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Limpar
          </button>
        </div>
        {feedback && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {feedback}
          </p>
        )}
      </div>

      {groups.map(([group, items]) => (
        <section
          key={group}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
            <span aria-hidden>{GROUP_ICONS[group] ?? "📄"}</span>
            {group}
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {items.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4"
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
                <button
                  type="button"
                  onClick={() => download(r.id)}
                  disabled={downloading === r.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
                >
                  {downloading === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  CSV
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
