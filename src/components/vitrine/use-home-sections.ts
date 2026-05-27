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
  /**
   * Drafts em edição. Cada chave é um section.id; valor é a config sendo
   * editada (snapshot local). Não é persistida enquanto o usuário não clicar
   * em "Salvar". Permite trocar modo/contagem/cursos livremente sem disparar
   * validação prematura no servidor (ex: "manual sem cursos").
   */
  const [drafts, setDrafts] = useState<Record<string, AnySectionConfig>>({})
  /** Quais drafts estão sendo enviados ao servidor agora. */
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

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
          method: "PATCH",
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

  /**
   * Inicia (ou retoma) edição de uma seção. Cria um draft fazendo snapshot
   * da config persistida. Idempotente — chamar várias vezes não sobrescreve
   * o draft em andamento.
   */
  const startEditingDraft = useCallback(
    (id: string) => {
      setDrafts((d) => {
        if (id in d) return d
        const s = sections?.find((x) => x.id === id)
        if (!s) return d
        return { ...d, [id]: s.config }
      })
    },
    [sections],
  )

  /**
   * Aplica patch parcial ao draft (modo, contagem, courseIds, título, etc.).
   * Se ainda não tem draft, cria a partir da config persistida.
   * **NÃO faz fetch.** O servidor só vê a mudança após `saveDraft`.
   */
  const patchDraft = useCallback(
    (id: string, patch: Partial<AnySectionConfig>) => {
      setDrafts((d) => {
        const base = d[id] ?? sections?.find((s) => s.id === id)?.config
        if (!base) return d
        return {
          ...d,
          [id]: { ...base, ...patch } as AnySectionConfig,
        }
      })
    },
    [sections],
  )

  /** Descarta o draft, voltando ao valor persistido. */
  const discardDraft = useCallback((id: string) => {
    setDrafts((d) => {
      if (!(id in d)) return d
      const next = { ...d }
      delete next[id]
      return next
    })
  }, [])

  /**
   * Persiste o draft no servidor. Em sucesso, limpa o draft e atualiza a
   * lista local. Em erro, mostra a mensagem real do servidor mas mantém o
   * draft (usuário ajusta e re-salva).
   * @returns true se salvou; false em erro
   */
  const saveDraft = useCallback(
    async (id: string): Promise<boolean> => {
      const draft = drafts[id]
      if (!draft) return true // nada a salvar
      setSavingIds((s) => new Set(s).add(id))
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: draft }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? "Falha ao salvar")
        }
        // Sucesso: aplica na lista, limpa draft.
        setSections((prev) =>
          prev
            ? prev.map((s) => (s.id === id ? { ...s, config: draft } : s))
            : prev,
        )
        setDrafts((d) => {
          const next = { ...d }
          delete next[id]
          return next
        })
        toast.success("Seção salva")
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar")
        return false
      } finally {
        setSavingIds((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
      }
    },
    [apiBase, drafts],
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
          method: "PATCH",
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
          method: "PATCH",
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
    move,
    reorder,
    createSection,
    removeSection,
    // Draft API (edição bufferizada com botão Salvar explícito)
    drafts,
    savingIds,
    startEditingDraft,
    patchDraft,
    saveDraft,
    discardDraft,
  }
}
