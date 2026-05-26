"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Plus,
  Save,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ---------------------------------------------------------------------------
// Tipos compartilhados com src/lib/home/sections.ts (manter em sincronia)
// ---------------------------------------------------------------------------

type SectionKind = "bestsellers" | "category_courses"
type Mode = "manual" | "random"
type Count = 4 | 8

interface BestsellersConfig {
  kind: "bestsellers"
  title: string
  subtitle: string
  mode: Mode
  count: Count
  courseIds: string[]
}
interface CategoryCoursesConfig {
  kind: "category_courses"
  title: string
  subtitle: string
  categoryId: string
  mode: Mode
  count: Count
  courseIds: string[]
  showSeeMore: boolean
}
type AnyConfig = BestsellersConfig | CategoryCoursesConfig

interface SectionRecord {
  id: string
  tenantId: string | null
  kind: SectionKind
  position: number
  enabled: boolean
  config: AnyConfig
}

interface CategoryOption {
  id: string
  name: string
  slug: string
  courseCount: number
}
interface CourseOption {
  id: string
  name: string
  categoryId: string | null
  imageUrl: string | null
}
interface Options {
  categories: CategoryOption[]
  courses: CourseOption[]
}

interface HomeSectionsManagerProps {
  apiBase: string // ex: "/api/admin/home-sections" ou "/api/painel/home-sections"
  title?: string
  description?: string
}

export function HomeSectionsManager({
  apiBase,
  title = "Seções da home",
  description,
}: HomeSectionsManagerProps) {
  const [sections, setSections] = useState<SectionRecord[] | null>(null)
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addingCategoryId, setAddingCategoryId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [sr, or] = await Promise.all([
        fetch(apiBase, { cache: "no-store" }),
        fetch(`${apiBase}/options`, { cache: "no-store" }),
      ])
      const sb = await sr.json()
      const ob = await or.json()
      if (!sr.ok) {
        setLoadError(sb.error ?? "Erro ao carregar seções")
        return
      }
      if (!or.ok) {
        setLoadError(ob.error ?? "Erro ao carregar opções")
        return
      }
      setSections(sb.data as SectionRecord[])
      setOptions(ob.data as Options)
    } catch {
      setLoadError("Erro de rede")
    }
  }, [apiBase])

  useEffect(() => {
    void load()
  }, [load])

  const reorder = async (id: string, dir: -1 | 1) => {
    if (!sections) return
    const idx = sections.findIndex((s) => s.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= sections.length) return
    // Não permite mover bestsellers do topo nem swap com bestsellers
    if (sections[idx].kind === "bestsellers" || sections[swap].kind === "bestsellers") {
      return
    }
    const next = [...sections]
    const tmp = next[idx]
    next[idx] = next[swap]
    next[swap] = tmp
    setSections(next)
    const order = next.map((s) => s.id)
    const res = await fetch(`${apiBase}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) void load()
  }

  const addCategorySection = async () => {
    if (!addingCategoryId || !options) return
    const cat = options.categories.find((c) => c.id === addingCategoryId)
    if (!cat) return
    setCreating(true)
    try {
      const body = {
        kind: "category_courses",
        config: {
          title: cat.name,
          subtitle: "",
          categoryId: cat.id,
          mode: "random" as Mode,
          count: cat.courseCount >= 8 ? 8 : 4,
          courseIds: [],
          showSeeMore: true,
        },
      }
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? "Erro ao criar seção")
        return
      }
      setAddingCategoryId(null)
      void load()
    } finally {
      setCreating(false)
    }
  }

  const availableCategories = useMemo(() => {
    if (!sections || !options) return [] as CategoryOption[]
    const usedIds = new Set(
      sections
        .filter((s) => s.kind === "category_courses")
        .map((s) => (s.config as CategoryCoursesConfig).categoryId),
    )
    return options.categories.filter((c) => !usedIds.has(c.id) && c.courseCount >= 4)
  }, [sections, options])

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {title}
        </h3>
        <p className="mt-0.5 text-[12px] text-gray-500">
          {description ??
            "Configure as seções de cursos da home: ordem, modo de exibição (manual/aleatório) e quantidade (4 ou 8 cursos). A seção “Mais vendidos” é sempre a primeira."}
        </p>
      </header>

      {loadError && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {loadError}
        </p>
      )}

      {sections === null || options === null ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {sections.map((s, i) => (
              <SectionCard
                key={s.id}
                section={s}
                options={options}
                index={i}
                total={sections.length}
                apiBase={apiBase}
                onReorder={(dir) => reorder(s.id, dir)}
                onChanged={load}
              />
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-4">
            <p className="mb-2 text-xs font-semibold text-gray-700">
              Adicionar seção de categoria
            </p>
            {availableCategories.length === 0 ? (
              <p className="text-[12px] text-gray-500">
                Todas as categorias com pelo menos 4 cursos ativos já estão em
                uso ou não há categorias elegíveis.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={addingCategoryId ?? ""}
                  onChange={(e) => setAddingCategoryId(e.target.value || null)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="">— escolha uma categoria —</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.courseCount} cursos
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => void addCategorySection()}
                  disabled={!addingCategoryId || creating}
                  className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Criando…
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1 h-4 w-4" />
                      Adicionar
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Card individual de uma seção
// ---------------------------------------------------------------------------

interface SectionCardProps {
  section: SectionRecord
  options: Options
  index: number
  total: number
  apiBase: string
  onReorder: (dir: -1 | 1) => void
  onChanged: () => void
}

function SectionCard({
  section,
  options,
  index,
  total,
  apiBase,
  onReorder,
  onChanged,
}: SectionCardProps) {
  const isBestsellers = section.kind === "bestsellers"
  const cfg = section.config
  const [title, setTitle] = useState(cfg.title)
  const [subtitle, setSubtitle] = useState(cfg.subtitle)
  const [mode, setMode] = useState<Mode>(cfg.mode)
  const [count, setCount] = useState<Count>(cfg.count)
  const [courseIds, setCourseIds] = useState<string[]>(cfg.courseIds)
  const [showSeeMore, setShowSeeMore] = useState(
    cfg.kind === "category_courses" ? cfg.showSeeMore : true,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cursos elegíveis para o picker manual
  const pickerCourses = useMemo(() => {
    if (cfg.kind === "category_courses") {
      return options.courses.filter((c) => c.categoryId === cfg.categoryId)
    }
    return options.courses
  }, [options.courses, cfg])

  const categoryName =
    cfg.kind === "category_courses"
      ? options.categories.find((c) => c.id === cfg.categoryId)?.name ?? "Categoria"
      : "Mais vendidos"

  const toggleCourse = (id: string) => {
    setCourseIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (cur.length >= count) {
        // Substitui a última seleção
        return [...cur.slice(0, count - 1), id]
      }
      return [...cur, id]
    })
  }

  const save = async () => {
    setError(null)
    if (mode === "manual" && courseIds.length !== count) {
      setError(`Modo manual: selecione exatamente ${count} cursos`)
      return
    }
    setSaving(true)
    const body = {
      config:
        cfg.kind === "bestsellers"
          ? {
              kind: "bestsellers",
              title: title.trim(),
              subtitle: subtitle.trim(),
              mode,
              count,
              courseIds: mode === "manual" ? courseIds : [],
            }
          : {
              kind: "category_courses",
              title: title.trim(),
              subtitle: subtitle.trim(),
              categoryId: (cfg as CategoryCoursesConfig).categoryId,
              mode,
              count,
              courseIds: mode === "manual" ? courseIds : [],
              showSeeMore,
            },
    }
    const res = await fetch(`${apiBase}/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? "Erro ao salvar")
      return
    }
    onChanged()
  }

  const toggleEnabled = async () => {
    if (isBestsellers) return
    const res = await fetch(`${apiBase}/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !section.enabled }),
    })
    if (res.ok) onChanged()
  }

  const remove = async () => {
    if (isBestsellers) return
    if (!confirm(`Remover a seção “${cfg.title}”?`)) return
    const res = await fetch(`${apiBase}/${section.id}`, { method: "DELETE" })
    if (res.ok) onChanged()
  }

  return (
    <li
      className={`rounded-xl border bg-white p-4 ${
        section.enabled ? "border-gray-200" : "border-gray-200 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onReorder(-1)}
              disabled={index === 0 || isBestsellers}
              title="Subir"
              className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onReorder(1)}
              disabled={index === total - 1 || isBestsellers}
              title="Descer"
              className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                #{index + 1}
              </span>
              <span className="rounded-full bg-[var(--color-pmb-lime-50)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-pmb-green-900)]">
                {isBestsellers ? "Mais vendidos · obrigatória" : categoryName}
              </span>
            </div>
            <h4 className="mt-1 text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {title || "(sem título)"}
            </h4>
            {subtitle && (
              <p className="text-[11px] text-gray-500">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleEnabled()}
            disabled={isBestsellers}
            title={
              isBestsellers
                ? "Mais vendidos não pode ser desativada"
                : section.enabled
                  ? "Ocultar"
                  : "Mostrar"
            }
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {isBestsellers ? (
              <Lock className="h-3.5 w-3.5" />
            ) : section.enabled ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={isBestsellers}
            title={
              isBestsellers
                ? "Mais vendidos não pode ser removida"
                : "Remover seção"
            }
            className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold">Título</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold">Subtítulo</Label>
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={200}
            placeholder="(opcional)"
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold">Modo</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${
                mode === "manual"
                  ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="font-bold text-[var(--color-pmb-green-900)]">Manual</div>
              <div className="mt-0.5 text-[11px] text-gray-500">Você escolhe os cursos</div>
            </button>
            <button
              type="button"
              onClick={() => setMode("random")}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${
                mode === "random"
                  ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="font-bold text-[var(--color-pmb-green-900)]">Aleatório</div>
              <div className="mt-0.5 text-[11px] text-gray-500">Sorteio por sessão</div>
            </button>
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold">Quantidade</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {[4, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setCount(n as Count)
                  if (courseIds.length > n) setCourseIds(courseIds.slice(0, n))
                }}
                className={`rounded-lg border px-3 py-2 text-center text-sm font-bold ${
                  count === n
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {n} cursos
              </button>
            ))}
          </div>
        </div>
      </div>

      {cfg.kind === "category_courses" && (
        <label className="mt-3 flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={showSeeMore}
            onChange={(e) => setShowSeeMore(e.target.checked)}
          />
          Mostrar botão “Ver todos os cursos”
        </label>
      )}

      {mode === "manual" && (
        <div className="mt-4">
          <Label className="text-xs font-semibold">
            Cursos selecionados ({courseIds.length}/{count})
          </Label>
          {pickerCourses.length === 0 ? (
            <p className="mt-2 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
              Nenhum curso disponível.
            </p>
          ) : (
            <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-gray-200">
              {pickerCourses.map((c) => {
                const checked = courseIds.includes(c.id)
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 ${
                      checked ? "bg-[var(--color-pmb-lime-50)]/40" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourse(c.id)}
                      className="h-3.5 w-3.5"
                    />
                    {c.imageUrl ? (
                      <span className="relative h-8 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                        <Image
                          src={c.imageUrl}
                          alt=""
                          fill
                          unoptimized
                          sizes="48px"
                          className="object-cover"
                        />
                      </span>
                    ) : (
                      <span className="h-8 w-12 shrink-0 rounded bg-gray-100" />
                    )}
                    <span className="flex-1 truncate">{c.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={saving}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              Salvar seção
            </>
          )}
        </Button>
      </div>
    </li>
  )
}
