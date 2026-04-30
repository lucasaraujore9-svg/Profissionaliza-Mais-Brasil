"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Star,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { CourseEditDrawer } from "./course-edit-drawer"
import type { CourseListItem } from "./course-list-table"

const filters = ["Todos", "Visíveis", "Ocultos", "Em destaque"] as const
type FilterValue = (typeof filters)[number]

function formatBRL(value: number): string {
  if (!value || value <= 0) return "—"
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function CourseListWrapper() {
  const [courses, setCourses] = useState<CourseListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterValue>("Todos")

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCourses()
  }, [loadCourses])

  const filtered = useMemo(() => {
    if (!courses) return []
    return courses.filter((course) => {
      if (filter === "Visíveis" && !course.isVisible) return false
      if (filter === "Ocultos" && course.isVisible) return false
      if (filter === "Em destaque" && !course.isFeatured) return false
      if (search.trim()) {
        return course.title.toLowerCase().includes(search.trim().toLowerCase())
      }
      return true
    })
  }, [courses, filter, search])

  const editingCourse = useMemo(
    () => (editingId ? courses?.find((c) => c.id === editingId) ?? null : null),
    [courses, editingId],
  )

  const handleToggleVisibility = async (id: string, next: boolean) => {
    const optimistic = courses?.map((c) =>
      c.id === id ? { ...c, isVisible: next } : c,
    )
    if (optimistic) setCourses(optimistic)

    const response = await fetch(`/api/painel/cursos/${id}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVisible: next }),
    })
    if (!response.ok) {
      void loadCourses()
    }
  }

  const handleSaved = () => {
    setEditingId(null)
    void loadCourses()
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar curso por título..."
            className="pl-9"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                  : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
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
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {filtered.length}{" "}
              {filtered.length === 1 ? "curso" : "cursos"}
              {filter !== "Todos" ? ` · ${filter.toLowerCase()}` : ""}
            </h3>
            <span className="text-xs text-gray-500">
              Toda alteração afeta apenas a sua vitrine
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-sm text-gray-500">
              Nenhum curso encontrado com os filtros atuais.
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
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleVisibility(c.id, !c.isVisible)
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-[var(--color-pmb-green-900)]"
                            title={
                              c.isVisible
                                ? "Ocultar da vitrine"
                                : "Mostrar na vitrine"
                            }
                          >
                            {c.isVisible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </button>
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
                        <button
                          type="button"
                          onClick={() => setEditingId(c.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--color-pmb-green)] px-3 py-1 text-[11px] font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
                        >
                          <Pencil className="h-3 w-3" /> Editar
                        </button>
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
    </>
  )
}
