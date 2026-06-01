"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowUpDown,
  CreditCard,
  Layers,
  Repeat,
  Search,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { CatalogHeader, type CatalogLastSync } from "./catalog-header"
import { CatalogCourseGrid, type CatalogCourse } from "./catalog-course-grid"
import { CatalogSyncLog } from "./catalog-sync-log"
import { CatalogEditDrawer } from "./catalog-edit-drawer"
import type { SyncLogEntry } from "@/lib/catalog/sync-log"

interface CatalogResponse {
  courses: CatalogCourse[]
  lastSync: CatalogLastSync | null
  total: number
}

interface SyncLogResponse {
  logs: SyncLogEntry[]
}

interface AdminCatalogClientProps {
  canEdit?: boolean
}

type PaymentFilter = "all" | "ONE_TIME" | "MONTHLY"
type StatusFilter = "all" | "ATIVO" | "INATIVO"
type CuradoriaFilter = "all" | "featured" | "override"
type SortValue =
  | "name-asc"
  | "recent-sync"
  | "recent-edit"
  | "price-desc"
  | "price-asc"
  | "students-desc"
  | "resellers-desc"

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "name-asc", label: "Nome (A–Z)" },
  { value: "recent-sync", label: "Sincronizados recentemente" },
  { value: "recent-edit", label: "Editados recentemente" },
  { value: "price-desc", label: "Maior preço" },
  { value: "price-asc", label: "Menor preço" },
  { value: "students-desc", label: "Mais alunos" },
  { value: "resellers-desc", label: "Mais revendedores" },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "ATIVO", label: "Ativos" },
  { value: "INATIVO", label: "Inativos" },
]

const CURADORIA_OPTIONS: { value: CuradoriaFilter; label: string }[] = [
  { value: "all", label: "Toda a curadoria" },
  { value: "featured", label: "Em destaque na home" },
  { value: "override", label: "Com preço personalizado" },
]

function priceOf(c: CatalogCourse): number {
  return c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0
}

export function AdminCatalogClient({ canEdit = false }: AdminCatalogClientProps) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [payment, setPayment] = useState<PaymentFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [curadoria, setCuradoria] = useState<CuradoriaFilter>("all")
  const [sort, setSort] = useState<SortValue>("name-asc")

  const load = useCallback(async () => {
    setError(null)
    try {
      const [cr, lr] = await Promise.all([
        fetch("/api/admin/catalogo"),
        fetch("/api/admin/catalogo/sync-log"),
      ])
      const [cb, lb] = await Promise.all([cr.json(), lr.json()])
      if (!cr.ok) {
        setError(cb.error ?? "Falha ao carregar catálogo")
        return
      }
      if (!lr.ok) {
        setError(lb.error ?? "Falha ao carregar histórico")
        return
      }
      setCatalog(cb.data as CatalogResponse)
      setLogs((lb.data as SyncLogResponse).logs)
    } catch {
      setError("Erro de rede ao carregar catálogo")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const courses = useMemo(() => catalog?.courses ?? [], [catalog])

  const counts = useMemo(
    () => ({
      total: courses.length,
      oneTime: courses.filter((c) => c.paymentTypeMain !== "MONTHLY").length,
      monthly: courses.filter((c) => c.paymentTypeMain === "MONTHLY").length,
    }),
    [courses],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = courses.filter((c) => {
      if (payment === "ONE_TIME" && c.paymentTypeMain === "MONTHLY") return false
      if (payment === "MONTHLY" && c.paymentTypeMain !== "MONTHLY") return false
      if (status !== "all" && c.status !== status) return false
      if (curadoria === "featured" && !c.destaqueHome) return false
      if (curadoria === "override" && !c.hasOverride && c.precoVitrineMain == null)
        return false
      if (term) {
        return (
          c.nome.toLowerCase().includes(term) ||
          c.slug.toLowerCase().includes(term)
        )
      }
      return true
    })

    const byDate = (a?: string, b?: string) => (b ?? "").localeCompare(a ?? "")
    const sorted = [...list]
    switch (sort) {
      case "recent-sync":
        sorted.sort((a, b) => byDate(a.syncedAt, b.syncedAt))
        break
      case "recent-edit":
        sorted.sort((a, b) => byDate(a.updatedAt, b.updatedAt))
        break
      case "price-desc":
        sorted.sort((a, b) => priceOf(b) - priceOf(a))
        break
      case "price-asc":
        sorted.sort((a, b) => priceOf(a) - priceOf(b))
        break
      case "students-desc":
        sorted.sort((a, b) => b.students - a.students)
        break
      case "resellers-desc":
        sorted.sort((a, b) => b.resellers - a.resellers)
        break
      case "name-asc":
      default:
        sorted.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        break
    }
    return sorted
  }, [courses, search, payment, status, curadoria, sort])

  const hasFilters =
    search.trim().length > 0 ||
    payment !== "all" ||
    status !== "all" ||
    curadoria !== "all" ||
    sort !== "name-asc"

  const resetFilters = () => {
    setSearch("")
    setPayment("all")
    setStatus("all")
    setCuradoria("all")
    setSort("name-asc")
  }

  if (loading && !catalog) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando catálogo...
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
  if (!catalog) return null

  return (
    <div className="space-y-6">
      <CatalogHeader
        lastSync={catalog.lastSync}
        totalCourses={catalog.total}
        onSynced={load}
      />

      {/* Barra de filtros inteligentes */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou slug do curso..."
              className="pl-9 pr-9"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="self-start rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-[var(--color-pmb-green-900)]"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Modo de pagamento
            </span>
            <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
              <SegmentButton
                active={payment === "all"}
                onClick={() => setPayment("all")}
                icon={Layers}
                label="Todos"
                count={counts.total}
              />
              <SegmentButton
                active={payment === "ONE_TIME"}
                onClick={() => setPayment("ONE_TIME")}
                icon={CreditCard}
                label="Pagamento único"
                count={counts.oneTime}
              />
              <SegmentButton
                active={payment === "MONTHLY"}
                onClick={() => setPayment("MONTHLY")}
                icon={Repeat}
                label="Mensalidade"
                count={counts.monthly}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              value={curadoria}
              onChange={(v) => setCuradoria(v as CuradoriaFilter)}
              options={CURADORIA_OPTIONS}
            />
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortValue)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-pmb-green-900)] shadow-sm outline-none focus:border-[var(--color-pmb-green)] focus:ring-1 focus:ring-[var(--color-pmb-lime)]"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <CatalogCourseGrid
        courses={filtered}
        totalCount={courses.length}
        canEdit={canEdit}
        onEdit={(id) => setEditingId(id)}
      />
      <CatalogSyncLog logs={logs} />
      <CatalogEditDrawer
        courseId={editingId}
        open={editingId !== null}
        onOpenChange={(v) => !v && setEditingId(null)}
        onSaved={load}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SegmentButton — filtro segmentado por modo de pagamento             */
/* ------------------------------------------------------------------ */

function SegmentButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Layers
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
          : "text-gray-500 hover:text-[var(--color-pmb-green-900)]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          active
            ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-pmb-green-900)] shadow-sm outline-none focus:border-[var(--color-pmb-green)] focus:ring-1 focus:ring-[var(--color-pmb-lime)]"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
