"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CourseListTable, type CourseListItem } from "./course-list-table"
import { CourseEditDrawer } from "./course-edit-drawer"

const filters = ["Todos", "Ativos", "Ocultos"] as const
type FilterValue = (typeof filters)[number]

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
      if (filter === "Ativos" && !course.isVisible) return false
      if (filter === "Ocultos" && course.isVisible) return false
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

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente remover este curso?")) return
    const response = await fetch(`/api/painel/cursos/${id}`, {
      method: "DELETE",
    })
    if (!response.ok) {
      const json = await response.json().catch(() => null)
      alert(json?.error ?? "Erro ao remover curso")
      return
    }
    void loadCourses()
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

        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
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
        <CourseListTable
          courses={filtered}
          onEdit={(id) => setEditingId(id)}
          onToggleVisibility={handleToggleVisibility}
          onDelete={handleDelete}
        />
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
