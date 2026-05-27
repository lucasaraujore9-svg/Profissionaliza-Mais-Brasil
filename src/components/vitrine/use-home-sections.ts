"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Tipos (espelham src/lib/home/sections.ts — mantidos aqui pra não puxar Prisma
// pro client bundle).
// ---------------------------------------------------------------------------

export type SectionKind =
  | "bestsellers"
  | "category_courses"
  | "categories_grid"
  | "institutional"

export type SectionMode = "manual" | "random"
export type SectionCount = 4 | 8

export type InstitutionalVariant =
  | "trust_bar"
  | "learn_anywhere"
  | "testimonials"
  | "final_cta"
  | "benefits"
  | "custom"

export interface InstitutionalItem {
  title: string
  body: string
  iconName: string | null
  imageUrl: string | null
  meta: string | null
}

export interface BestsellersConfig {
  kind: "bestsellers"
  title: string
  subtitle: string
  mode: SectionMode
  count: SectionCount
  courseIds: string[]
}

export interface CategoryCoursesConfig {
  kind: "category_courses"
  title: string
  subtitle: string
  categoryId: string
  mode: SectionMode
  count: SectionCount
  courseIds: string[]
  showSeeMore: boolean
}

export interface CategoriesGridConfig {
  kind: "categories_grid"
  title: string
  subtitle: string
  categoryIds: string[]
}

export interface InstitutionalConfig {
  kind: "institutional"
  variant: InstitutionalVariant
  title: string
  subtitle: string
  body: string
  imageUrl: string | null
  buttonText: string | null
  buttonHref: string | null
  secondaryButtonText: string | null
  secondaryButtonHref: string | null
  items: InstitutionalItem[]
}

export type AnySectionConfig =
  | BestsellersConfig
  | CategoryCoursesConfig
  | CategoriesGridConfig
  | InstitutionalConfig

export interface SectionRecord {
  id: string
  tenantId: string | null
  kind: SectionKind
  position: number
  enabled: boolean
  config: AnySectionConfig
}

export interface CategoryOption {
  id: string
  name: string
  slug: string
  courseCount: number
}
export interface CourseOption {
  id: string
  name: string
  categoryId: string | null
  imageUrl: string | null
}
export interface SectionOptions {
  categories: CategoryOption[]
  courses: CourseOption[]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseHomeSectionsOptions {
  /** Base sem trailing slash: "/api/admin/home-sections" ou "/api/painel/home-sections". */
  apiBase: string
}

export function useHomeSections({ apiBase }: UseHomeSectionsOptions) {
  const [sections, setSections] = useState<SectionRecord[] | null>(null)
  const [options, setOptions] = useState<SectionOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const [sr, or] = await Promise.all([
        fetch(apiBase, { cache: "no-store" }),
        fetch(`${apiBase}/options`, { cache: "no-store" }),
      ])
      if (!sr.ok) throw new Error("Falha ao carregar seções da home")
      if (!or.ok) throw new Error("Falha ao carregar catálogo")
      const sBody = await sr.json()
      const oBody = await or.json()
      setSections(sBody.data as SectionRecord[])
      setOptions(oBody.data as SectionOptions)
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Erro ao carregar a vitrine",
      )
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void load()
  }, [load])

  /** Toggle on/off otimista. */
  const toggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const prev = sections
      if (!prev) return
      setSections(
        prev.map((s) => (s.id === id ? { ...s, enabled } : s)),
      )
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao salvar")
        }
        toast.success(enabled ? "Seção ativada na home" : "Seção desativada")
      } catch (err) {
        setSections(prev)
        toast.error(err instanceof Error ? err.message : "Erro ao salvar")
      }
    },
    [apiBase, sections],
  )

  /** Update parcial da config (mode, count, courseIds, title, etc.). */
  const updateConfig = useCallback(
    async (id: string, patch: Partial<AnySectionConfig>) => {
      const prev = sections
      if (!prev) return
      const next = prev.map((s) =>
        s.id === id
          ? ({ ...s, config: { ...s.config, ...patch } as AnySectionConfig })
          : s,
      )
      setSections(next)
      const target = next.find((s) => s.id === id)
      if (!target) return
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: target.config }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao salvar")
        }
      } catch (err) {
        setSections(prev)
        toast.error(err instanceof Error ? err.message : "Erro ao salvar")
      }
    },
    [apiBase, sections],
  )

  /** Mover seção `n` posições (positivo = baixo, negativo = cima). Atomicamente otimista. */
  const move = useCallback(
    async (id: string, delta: -1 | 1) => {
      const prev = sections
      if (!prev) return
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return
      const target = idx + delta
      if (target < 0 || target >= prev.length) return
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target]!, next[idx]!]
      setSections(next)
      try {
        const res = await fetch(`${apiBase}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next.map((s) => s.id) }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao reordenar")
        }
      } catch (err) {
        setSections(prev)
        toast.error(err instanceof Error ? err.message : "Erro ao reordenar")
      }
    },
    [apiBase, sections],
  )

  /** Reorder por drag: aplica nova ordem completa. */
  const reorder = useCallback(
    async (nextOrder: string[]) => {
      const prev = sections
      if (!prev) return
      const map = new Map(prev.map((s) => [s.id, s]))
      const next = nextOrder
        .map((id) => map.get(id))
        .filter((s): s is SectionRecord => Boolean(s))
      if (next.length !== prev.length) return
      setSections(next)
      try {
        const res = await fetch(`${apiBase}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: nextOrder }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao reordenar")
        }
      } catch (err) {
        setSections(prev)
        toast.error(err instanceof Error ? err.message : "Erro ao reordenar")
      }
    },
    [apiBase, sections],
  )

  /** Criar seção. Usado por bestsellers e categories_grid (singletons) e auto-pop de category_courses. */
  const createSection = useCallback(
    async (kind: SectionKind, config: AnySectionConfig) => {
      try {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, config }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao criar seção")
        }
        await load()
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar")
        return false
      }
    },
    [apiBase, load],
  )

  /** Remove uma seção. Bestsellers não pode (servidor recusa). */
  const removeSection = useCallback(
    async (id: string) => {
      const prev = sections
      if (!prev) return
      setSections(prev.filter((s) => s.id !== id))
      try {
        const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao remover")
        }
        toast.success("Seção removida")
      } catch (err) {
        setSections(prev)
        toast.error(err instanceof Error ? err.message : "Erro ao remover")
      }
    },
    [apiBase, sections],
  )

  return {
    sections,
    options,
    loading,
    loadError,
    reload: load,
    toggleEnabled,
    updateConfig,
    move,
    reorder,
    createSection,
    removeSection,
  }
}
