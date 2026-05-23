"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  FileSpreadsheet,
  Briefcase,
  GraduationCap,
  Store,
  DollarSign,
  BookOpen,
  FileText,
  type LucideIcon,
} from "lucide-react"

interface ReportItem {
  id: string
  group: string
  label: string
  description: string
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  Vendas: Briefcase,
  Alunos: GraduationCap,
  Revendedores: Store,
  Financeiro: DollarSign,
  Catálogo: BookOpen,
}

export function ReportsClient() {
  const router = useRouter()
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

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

  function open(id: string) {
    const params = new URLSearchParams()
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    const qs = params.toString()
    router.push(`/admin/relatorios/${id}${qs ? `?${qs}` : ""}`)
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
          Aplicam-se aos relatórios que olham período. Em branco = histórico
          completo. Você pode mudar os filtros depois ao visualizar o relatório.
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
      </div>

      {groups.map(([group, items]) => (
        <section
          key={group}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
            {(() => {
              const Icon = GROUP_ICONS[group] ?? FileText
              return (
                <Icon
                  className="h-4 w-4 text-[var(--color-pmb-green)]"
                  aria-hidden
                />
              )
            })()}
            {group}
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {items.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open(r.id)}
                className="group flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-left transition-all hover:border-[var(--color-pmb-green)] hover:shadow-sm"
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
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors group-hover:bg-[var(--color-pmb-green-700)]">
                  Visualizar
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
