"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ArrowUpDown,
  BookOpen,
  CreditCard,
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  Pencil,
  Repeat,
  Search,
  Sparkles,
  Star,
  Table2,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { CourseEditDrawer } from "./course-edit-drawer"
import { CourseBulkEdit } from "./course-bulk-edit"
import type { CourseListItem } from "./course-types"

type FilterValue = "Todos" | "Visíveis" | "Ocultos" | "Em destaque"
type PaymentFilter = "all" | "ONE_TIME" | "MONTHLY"
type SortValue =
  | "ordem"
  | "recent-edit"
  | "recent-add"
  | "price-desc"
  | "price-asc"
  | "title-asc"
  | "enrollments-desc"

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "ordem", label: "Ordem da vitrine (padrão)" },
  { value: "recent-edit", label: "Editados recentemente" },
  { value: "recent-add", label: "Adicionados recentemente" },
  { value: "price-desc", label: "Maior preço" },
  { value: "price-asc", label: "Menor preço" },
  { value: "title-asc", label: "Título (A–Z)" },
  { value: "enrollments-desc", label: "Mais matrículas" },
]

function formatBRL(value: number): string {
  if (!value || value <= 0) return "—"
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/**
 * @param canManage `catalogo.manage` resolvido server-side. Sem ela a tela é
 * somente leitura: as APIs de edição respondem 403 e mostrar os botões só
 * produziria erro no clique.
 */
export function CourseListWrapper({ canManage }: { canManage: boolean }) {
  const [courses, setCourses] = useState<CourseListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterValue>("Todos")
  const [payment, setPayment] = useState<PaymentFilter>("all")
  const [sort, setSort] = useState<SortValue>("ordem")
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [tipDismissed, setTipDismissed] = useState(false)

  const loadCourses = useCallback(async () => {
    setLoadError(null)
    try {
      const response = await fetch("/api/painel/cursos")
      const json = await response.json()
      if (!response.ok) {
        setLoadError(json?.error ?? "Erro ao carregar cursos")
        return
      }
      setCourses(json.data as CourseListItem[])
    } catch {
      setLoadError("Erro de rede")
    }
  }, [])

  useEffect(() => {
    void loadCourses()
  }, [loadCourses])

  const stats = useMemo(() => {
    if (!courses)
      return { total: 0, visible: 0, hidden: 0, featured: 0, oneTime: 0, monthly: 0 }
    return {
      total: courses.length,
      visible: courses.filter((c) => c.isVisible).length,
      hidden: courses.filter((c) => !c.isVisible).length,
      featured: courses.filter((c) => c.isFeatured).length,
      oneTime: courses.filter((c) => c.paymentType === "ONE_TIME").length,
      monthly: courses.filter((c) => c.paymentType === "MONTHLY").length,
    }
  }, [courses])

  const filtered = useMemo(() => {
    if (!courses) return []
    const list = courses.filter((course) => {
      if (filter === "Visíveis" && !course.isVisible) return false
      if (filter === "Ocultos" && course.isVisible) return false
      if (filter === "Em destaque" && !course.isFeatured) return false
      if (payment === "ONE_TIME" && course.paymentType !== "ONE_TIME") return false
      if (payment === "MONTHLY" && course.paymentType !== "MONTHLY") return false
      if (search.trim()) {
        return course.title.toLowerCase().includes(search.trim().toLowerCase())
      }
      return true
    })

    const byDate = (a?: string, b?: string) => (b ?? "").localeCompare(a ?? "")
    const sorted = [...list]
    switch (sort) {
      case "recent-edit":
        sorted.sort((a, b) => byDate(a.updatedAt, b.updatedAt))
        break
      case "recent-add":
        sorted.sort((a, b) => byDate(a.createdAt, b.createdAt))
        break
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price)
        break
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price)
        break
      case "title-asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
        break
      case "enrollments-desc":
        sorted.sort((a, b) => b.enrollmentsCount - a.enrollmentsCount)
        break
      case "ordem":
      default:
        sorted.sort(
          (a, b) =>
            a.customOrder - b.customOrder || byDate(a.createdAt, b.createdAt),
        )
        break
    }
    return sorted
  }, [courses, filter, payment, search, sort])

  const editingCourse = useMemo(
    () => (editingId ? courses?.find((c) => c.id === editingId) ?? null : null),
    [courses, editingId],
  )

  const handleToggleVisibility = async (id: string, next: boolean) => {
    const optimistic = courses?.map((c) =>
      c.id === id ? { ...c, isVisible: next } : c,
    )
    if (optimistic) setCourses(optimistic)

    setTogglingId(id)
    try {
      const response = await fetch(`/api/painel/cursos/${id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: next }),
      })
      if (!response.ok) {
        toast.error(
          next
            ? "Não foi possível mostrar o curso. Tente novamente."
            : "Não foi possível ocultar o curso. Tente novamente.",
        )
        void loadCourses()
      }
    } catch {
      toast.error("Erro de rede ao atualizar a visibilidade.")
      void loadCourses()
    } finally {
      setTogglingId(null)
    }
  }

  const handleSaved = () => {
    setEditingId(null)
    void loadCourses()
  }

  const hasFilters =
    filter !== "Todos" ||
    payment !== "all" ||
    sort !== "ordem" ||
    search.trim().length > 0

  const resetFilters = () => {
    setSearch("")
    setFilter("Todos")
    setPayment("all")
    setSort("ordem")
  }

  return (
    <>
      {/* Cards de estatísticas clicáveis (também funcionam como filtros) */}
      {courses && courses.length > 0 && (
        <div
          data-tour="cursos:stats"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label="Total de cursos"
            value={stats.total}
            active={filter === "Todos"}
            onClick={() => setFilter("Todos")}
            icon={BookOpen}
            tone="neutral"
          />
          <StatCard
            label="Visíveis na vitrine"
            value={stats.visible}
            active={filter === "Visíveis"}
            onClick={() => setFilter("Visíveis")}
            icon={Eye}
            tone="success"
          />
          <StatCard
            label="Ocultos"
            value={stats.hidden}
            active={filter === "Ocultos"}
            onClick={() => setFilter("Ocultos")}
            icon={EyeOff}
            tone="muted"
          />
          <StatCard
            label="Em destaque"
            value={stats.featured}
            active={filter === "Em destaque"}
            onClick={() => setFilter("Em destaque")}
            icon={Star}
            tone="warning"
          />
        </div>
      )}

      {/* Toolbar de busca + dica */}
      <div
        data-tour="cursos:busca"
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por título do curso..."
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

          <div className="flex items-center gap-2 self-start">
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-[var(--color-pmb-green-900)]"
              >
                Limpar filtros
              </button>
            )}
            {canManage && courses && courses.length > 0 && (
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                data-tour="cursos:bulk"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
              >
                <Table2 className="h-3.5 w-3.5" />
                Edição em massa
              </button>
            )}
          </div>
        </div>

        {/* Filtro por modo de pagamento + ordenação */}
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
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
                count={stats.total}
              />
              <SegmentButton
                active={payment === "ONE_TIME"}
                onClick={() => setPayment("ONE_TIME")}
                icon={CreditCard}
                label="Pagamento único"
                count={stats.oneTime}
              />
              <SegmentButton
                active={payment === "MONTHLY"}
                onClick={() => setPayment("MONTHLY")}
                icon={Repeat}
                label="Mensalidade"
                count={stats.monthly}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
            <span className="shrink-0">Ordenar por</span>
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

        {canManage && !tipDismissed && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]/40 p-3 text-xs text-[rgba(2,89,24,0.7)]">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" />
            <p className="flex-1">
              <strong className="font-semibold text-[var(--color-pmb-green-900)]">Dica:</strong>{" "}
              Use o ícone do olho para mostrar ou ocultar um curso na sua vitrine.
              Edite preço, descrição e capa para personalizar cada curso para seus alunos.
            </p>
            <button
              type="button"
              onClick={() => setTipDismissed(true)}
              aria-label="Dispensar dica"
              className="-mt-0.5 -mr-0.5 rounded-md p-1 text-[var(--color-pmb-green)]/60 hover:bg-[var(--color-pmb-lime-50)] hover:text-[var(--color-pmb-green-900)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {loadError}
        </div>
      ) : !courses ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando cursos...
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(2,89,24,0.18)] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--color-pmb-green-900)]">
            Catálogo ainda não disponível
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            Os cursos da plataforma aparecem aqui automaticamente. Aguarde a
            sincronização inicial ou contate o suporte se demorar mais de 1 hora.
          </p>
        </div>
      ) : (
        <div
          data-tour="cursos:lista"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {filtered.length}{" "}
              {filtered.length === 1 ? "curso encontrado" : "cursos encontrados"}
              {filter !== "Todos" ? ` · ${filter.toLowerCase()}` : ""}
              {payment === "ONE_TIME"
                ? " · pagamento único"
                : payment === "MONTHLY"
                  ? " · mensalidade"
                  : ""}
            </h3>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
              <Info className="h-3 w-3" />
              {canManage
                ? "Alterações afetam apenas a sua vitrine"
                : "Somente leitura — peça ao titular a permissão de editar cursos"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                Nenhum curso encontrado
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
                Tente ajustar os filtros ou{" "}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-semibold text-[var(--color-pmb-green)] underline hover:text-[var(--color-pmb-green-700)]"
                >
                  ver todos os cursos
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((c) => {
                const parcelas = c.parcelas
                const valorParcela =
                  parcelas && parcelas > 1 && c.price > 0
                    ? c.price / parcelas
                    : null
                return (
                  <article
                    key={c.id}
                    className={`group overflow-hidden rounded-xl border bg-gray-50/60 transition-all hover:shadow-sm ${
                      c.isVisible
                        ? "border-gray-200 hover:border-[rgba(2,89,24,0.25)]"
                        : "border-gray-200 opacity-60"
                    }`}
                  >
                    {c.capaImageUrl ? (
                      <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                        <Image
                          src={c.capaImageUrl}
                          alt={c.title}
                          fill
                          sizes="(max-width:768px) 100vw, 25vw"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : null}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                          <BookOpen className="h-4 w-4" />
                        </span>
                        <div className="flex items-center gap-1">
                          {c.isFeatured && (
                            <span title="Em destaque na vitrine">
                              <Star className="h-3.5 w-3.5 fill-[var(--color-pmb-gold)] text-[var(--color-pmb-gold)]" />
                            </span>
                          )}
                          {canManage ? (
                            <button
                              type="button"
                              disabled={togglingId === c.id}
                              onClick={() =>
                                handleToggleVisibility(c.id, !c.isVisible)
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-[var(--color-pmb-green-900)] disabled:cursor-not-allowed disabled:opacity-60"
                              title={
                                c.isVisible
                                  ? "Ocultar da vitrine"
                                  : "Mostrar na vitrine"
                              }
                            >
                              {togglingId === c.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : c.isVisible ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400"
                              title={
                                c.isVisible
                                  ? "Visível na vitrine"
                                  : "Oculto na vitrine"
                              }
                            >
                              {c.isVisible ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <h4 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-[var(--color-pmb-green-900)]">
                        {c.title}
                      </h4>
                      {c.cargaHoraria && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          {c.cargaHoraria}h · {c.qtdAulas} aulas
                        </p>
                      )}

                      <div className="mt-3 flex items-baseline justify-between text-xs text-gray-600">
                        <div>
                          <p className="font-mono text-sm font-bold text-[var(--color-pmb-green-900)]">
                            {formatBRL(c.price)}
                            {c.paymentType === "MONTHLY" && (
                              <span className="text-[11px] font-medium text-gray-500">
                                {" "}/mês
                              </span>
                            )}
                          </p>
                          {c.paymentType === "MONTHLY" ? (
                            <p className="text-[11px] text-gray-500">
                              {parcelas
                                ? `${parcelas} ${parcelas === 1 ? "mensalidade" : "mensalidades"}`
                                : "Mensalidade recorrente"}
                            </p>
                          ) : valorParcela ? (
                            <p className="text-[11px] text-gray-500">
                              {parcelas}x de {formatBRL(valorParcela)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-200 pt-3">
                        {c.hasCustomCapa && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-mist)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                            <Sparkles className="h-3 w-3" /> capa
                          </span>
                        )}
                        {c.hasCustomDescription && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-mist)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                            <Sparkles className="h-3 w-3" /> descrição
                          </span>
                        )}
                        {c.hasCustomParcelas && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-mist)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                            <Sparkles className="h-3 w-3" /> parcelas
                          </span>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setEditingId(c.id)}
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--color-pmb-green)] px-3 py-1 text-[11px] font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
                          >
                            <Pencil className="h-3 w-3" /> Editar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      <CourseEditDrawer
        course={editingCourse}
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        onSaved={handleSaved}
      />

      <CourseBulkEdit
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => {
          setBulkOpen(false)
          void loadCourses()
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* SegmentButton — botão de filtro segmentado (modo de pagamento)      */
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
  icon: typeof BookOpen
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

/* ------------------------------------------------------------------ */
/* StatCard — card clicável usado como filtro                          */
/* ------------------------------------------------------------------ */

type StatTone = "neutral" | "success" | "muted" | "warning"

const TONE_STYLES: Record<StatTone, { icon: string; activeBorder: string }> = {
  neutral: {
    icon: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]",
    activeBorder: "border-[var(--color-pmb-green)]",
  },
  success: {
    icon: "bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green-700)]",
    activeBorder: "border-[var(--color-pmb-green)]",
  },
  muted: {
    icon: "bg-gray-100 text-gray-500",
    activeBorder: "border-gray-400",
  },
  warning: {
    icon: "bg-[var(--color-pmb-gold)]/15 text-[var(--color-pmb-gold-600)]",
    activeBorder: "border-[var(--color-pmb-gold)]",
  },
}

function StatCard({
  label,
  value,
  active,
  onClick,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
  icon: typeof BookOpen
  tone: StatTone
}) {
  const tones = TONE_STYLES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${
        active
          ? `${tones.activeBorder} ring-2 ring-offset-1 ring-[var(--color-pmb-lime)]`
          : "border-gray-200"
      }`}
      aria-pressed={active}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones.icon}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-bold text-[var(--color-pmb-green-900)]">
          {value}
        </p>
      </div>
    </button>
  )
}
