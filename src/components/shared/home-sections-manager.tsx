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
import { Textarea } from "@/components/ui/textarea"

// ---------------------------------------------------------------------------
// Tipos sincronizados com src/lib/home/sections.ts
// ---------------------------------------------------------------------------

type SectionKind =
  | "bestsellers"
  | "category_courses"
  | "categories_grid"
  | "institutional"
type Mode = "manual" | "random"
type Count = 4 | 8
type InstitutionalVariant =
  | "trust_bar"
  | "learn_anywhere"
  | "testimonials"
  | "final_cta"
  | "benefits"
  | "custom"

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
interface CategoriesGridConfig {
  kind: "categories_grid"
  title: string
  subtitle: string
  categoryIds: string[]
}
interface InstitutionalItem {
  title: string
  body: string
  iconName: string | null
  imageUrl: string | null
  meta: string | null
}
interface InstitutionalConfig {
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
type AnyConfig =
  | BestsellersConfig
  | CategoryCoursesConfig
  | CategoriesGridConfig
  | InstitutionalConfig

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
  apiBase: string
  title?: string
  description?: string
}

const INSTITUTIONAL_VARIANTS: { value: InstitutionalVariant; label: string }[] = [
  { value: "trust_bar", label: "Barra de benefícios (ícone + texto curto)" },
  { value: "learn_anywhere", label: "Texto + imagem + CTA" },
  { value: "testimonials", label: "Depoimentos" },
  { value: "final_cta", label: "Chamada final (CTA grande)" },
  { value: "benefits", label: "Grid de benefícios (4 colunas)" },
  { value: "custom", label: "Customizado (texto + botão)" },
]

const LUCIDE_ICONS = [
  "Award",
  "Banknote",
  "ShieldCheck",
  "Smartphone",
  "MessageCircle",
  "Clock",
  "Infinity",
  "Quote",
]

export function HomeSectionsManager({
  apiBase,
  title = "Seções da home",
  description,
}: HomeSectionsManagerProps) {
  const [sections, setSections] = useState<SectionRecord[] | null>(null)
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addKind, setAddKind] = useState<"" | "category_courses" | "categories_grid" | "institutional">("")
  const [addCategoryId, setAddCategoryId] = useState<string>("")
  const [addVariant, setAddVariant] = useState<InstitutionalVariant>("custom")
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
    else void load()
  }

  const create = async () => {
    if (!addKind) return
    let body: { kind: SectionKind; config: AnyConfig } | null = null
    if (addKind === "category_courses") {
      if (!addCategoryId || !options) return
      const cat = options.categories.find((c) => c.id === addCategoryId)
      if (!cat) return
      body = {
        kind: "category_courses",
        config: {
          kind: "category_courses",
          title: cat.name,
          subtitle: "",
          categoryId: cat.id,
          mode: "random",
          count: cat.courseCount >= 8 ? 8 : 4,
          courseIds: [],
          showSeeMore: true,
        },
      }
    } else if (addKind === "categories_grid") {
      body = {
        kind: "categories_grid",
        config: {
          kind: "categories_grid",
          title: "Qual profissão você quer aprender?",
          subtitle: "",
          categoryIds: [],
        },
      }
    } else if (addKind === "institutional") {
      body = {
        kind: "institutional",
        config: {
          kind: "institutional",
          variant: addVariant,
          title: "",
          subtitle: "",
          body: "",
          imageUrl: null,
          buttonText: null,
          buttonHref: null,
          secondaryButtonText: null,
          secondaryButtonHref: null,
          items: [],
        },
      }
    }
    if (!body) return

    setCreating(true)
    try {
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
      setAddKind("")
      setAddCategoryId("")
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

  const hasCategoriesGrid = useMemo(
    () => (sections ?? []).some((s) => s.kind === "categories_grid"),
    [sections],
  )

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {title}
        </h3>
        <p className="mt-0.5 text-[12px] text-gray-500">
          {description ??
            "Configure as seções da home: cursos, categorias e blocos institucionais. Ordene livremente — “Os cursos mais vendidos” é mantida sempre antes das outras seções de curso."}
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
              Adicionar bloco
            </p>
            <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <select
                value={addKind}
                onChange={(e) => {
                  setAddKind(e.target.value as typeof addKind)
                  setAddCategoryId("")
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">— tipo —</option>
                <option value="category_courses">Seção de cursos por categoria</option>
                <option value="categories_grid" disabled={hasCategoriesGrid}>
                  Grid de categorias{hasCategoriesGrid ? " (já existe)" : ""}
                </option>
                <option value="institutional">Bloco institucional</option>
              </select>
              {addKind === "category_courses" && (
                <select
                  value={addCategoryId}
                  onChange={(e) => setAddCategoryId(e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="">— categoria —</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.courseCount} cursos
                    </option>
                  ))}
                </select>
              )}
              {addKind === "institutional" && (
                <select
                  value={addVariant}
                  onChange={(e) => setAddVariant(e.target.value as InstitutionalVariant)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
                >
                  {INSTITUTIONAL_VARIANTS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
              {(addKind === "categories_grid" || addKind === "") && (
                <span />
              )}
              <Button
                size="sm"
                type="button"
                onClick={() => void create()}
                disabled={
                  creating ||
                  !addKind ||
                  (addKind === "category_courses" && !addCategoryId) ||
                  (addKind === "categories_grid" && hasCategoriesGrid)
                }
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
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Card individual (decide qual editor renderizar por kind)
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

function SectionCard(props: SectionCardProps) {
  const { section } = props
  if (section.kind === "bestsellers" || section.kind === "category_courses") {
    return <CourseSectionCard {...props} />
  }
  if (section.kind === "categories_grid") {
    return <CategoriesGridCard {...props} />
  }
  return <InstitutionalCard {...props} />
}

function CardShell({
  index,
  total,
  isLocked,
  enabled,
  onReorder,
  onToggleEnabled,
  onDelete,
  badge,
  title,
  subtitle,
  children,
}: {
  index: number
  total: number
  isLocked: boolean
  enabled: boolean
  onReorder: (dir: -1 | 1) => void
  onToggleEnabled: () => void
  onDelete: () => void
  badge: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <li className={`rounded-xl border bg-white p-4 ${enabled ? "border-gray-200" : "border-gray-200 opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onReorder(-1)}
              disabled={index === 0}
              title="Subir"
              className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onReorder(1)}
              disabled={index === total - 1}
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
                {badge}
              </span>
            </div>
            <h4 className="mt-1 text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {title || "(sem título)"}
            </h4>
            {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleEnabled}
            disabled={isLocked}
            title={isLocked ? "Esta seção não pode ser desativada" : enabled ? "Ocultar" : "Mostrar"}
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isLocked}
            title={isLocked ? "Esta seção não pode ser removida" : "Remover"}
            className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Editor: bestsellers / category_courses
// ---------------------------------------------------------------------------

function CourseSectionCard({
  section,
  options,
  index,
  total,
  apiBase,
  onReorder,
  onChanged,
}: SectionCardProps) {
  const isBestsellers = section.kind === "bestsellers"
  const cfg = section.config as BestsellersConfig | CategoryCoursesConfig
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
      if (cur.length >= count) return [...cur.slice(0, count - 1), id]
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
    <CardShell
      index={index}
      total={total}
      isLocked={isBestsellers}
      enabled={section.enabled}
      onReorder={onReorder}
      onToggleEnabled={() => void toggleEnabled()}
      onDelete={() => void remove()}
      badge={isBestsellers ? "Mais vendidos · obrigatória" : `Cursos · ${categoryName}`}
      title={title}
      subtitle={subtitle}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <FieldText label="Título" value={title} onChange={setTitle} maxLength={120} />
        <FieldText label="Subtítulo" value={subtitle} onChange={setSubtitle} maxLength={200} placeholder="(opcional)" />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold">Modo</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(["manual", "random"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${
                  mode === m
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="font-bold text-[var(--color-pmb-green-900)]">
                  {m === "manual" ? "Manual" : "Aleatório"}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {m === "manual" ? "Você escolhe os cursos" : "Sorteio por sessão"}
                </div>
              </button>
            ))}
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
          <input type="checkbox" checked={showSeeMore} onChange={(e) => setShowSeeMore(e.target.checked)} />
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
                        <Image src={c.imageUrl} alt="" fill unoptimized sizes="48px" className="object-cover" />
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

      <ErrorAndSave error={error} saving={saving} onSave={() => void save()} />
    </CardShell>
  )
}

// ---------------------------------------------------------------------------
// Editor: categories_grid
// ---------------------------------------------------------------------------

function CategoriesGridCard({
  section,
  options,
  index,
  total,
  apiBase,
  onReorder,
  onChanged,
}: SectionCardProps) {
  const cfg = section.config as CategoriesGridConfig
  const [title, setTitle] = useState(cfg.title)
  const [subtitle, setSubtitle] = useState(cfg.subtitle)
  const [categoryIds, setCategoryIds] = useState<string[]>(cfg.categoryIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleCat = (id: string) => {
    setCategoryIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  const moveCat = (id: string, dir: -1 | 1) => {
    const i = categoryIds.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= categoryIds.length) return
    const next = [...categoryIds]
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    setCategoryIds(next)
  }

  const save = async () => {
    setError(null)
    setSaving(true)
    const res = await fetch(`${apiBase}/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: { kind: "categories_grid", title: title.trim(), subtitle: subtitle.trim(), categoryIds },
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? "Erro ao salvar")
      return
    }
    onChanged()
  }

  return (
    <CardShell
      index={index}
      total={total}
      isLocked={false}
      enabled={section.enabled}
      onReorder={onReorder}
      onToggleEnabled={async () => {
        const res = await fetch(`${apiBase}/${section.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !section.enabled }),
        })
        if (res.ok) onChanged()
      }}
      onDelete={async () => {
        if (!confirm("Remover este bloco de categorias?")) return
        const res = await fetch(`${apiBase}/${section.id}`, { method: "DELETE" })
        if (res.ok) onChanged()
      }}
      badge="Grid de categorias"
      title={title}
      subtitle={subtitle}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <FieldText label="Título" value={title} onChange={setTitle} maxLength={120} />
        <FieldText label="Subtítulo" value={subtitle} onChange={setSubtitle} maxLength={200} />
      </div>

      <div className="mt-4">
        <Label className="text-xs font-semibold">
          Categorias exibidas{" "}
          <span className="font-normal text-gray-500">
            (vazio = todas as ativas)
          </span>
        </Label>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {options.categories.map((c) => {
            const checked = categoryIds.includes(c.id)
            const order = categoryIds.indexOf(c.id)
            return (
              <div
                key={c.id}
                className={`flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs ${
                  checked ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/40" : ""
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleCat(c.id)} className="h-3.5 w-3.5" />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-[10px] text-gray-400">{c.courseCount}</span>
                {checked && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveCat(c.id, -1)}
                      disabled={order === 0}
                      className="rounded border border-gray-200 p-0.5 disabled:opacity-30"
                      title="Subir"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCat(c.id, 1)}
                      disabled={order === categoryIds.length - 1}
                      className="rounded border border-gray-200 p-0.5 disabled:opacity-30"
                      title="Descer"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ErrorAndSave error={error} saving={saving} onSave={() => void save()} />
    </CardShell>
  )
}

// ---------------------------------------------------------------------------
// Editor: institutional (variant-aware)
// ---------------------------------------------------------------------------

function InstitutionalCard({
  section,
  index,
  total,
  apiBase,
  onReorder,
  onChanged,
}: SectionCardProps) {
  const cfg = section.config as InstitutionalConfig
  const [variant, setVariant] = useState<InstitutionalVariant>(cfg.variant)
  const [title, setTitle] = useState(cfg.title)
  const [subtitle, setSubtitle] = useState(cfg.subtitle)
  const [body, setBody] = useState(cfg.body)
  const [imageUrl, setImageUrl] = useState(cfg.imageUrl ?? "")
  const [buttonText, setButtonText] = useState(cfg.buttonText ?? "")
  const [buttonHref, setButtonHref] = useState(cfg.buttonHref ?? "")
  const [secondaryButtonText, setSecondaryButtonText] = useState(cfg.secondaryButtonText ?? "")
  const [secondaryButtonHref, setSecondaryButtonHref] = useState(cfg.secondaryButtonHref ?? "")
  const [items, setItems] = useState<InstitutionalItem[]>(cfg.items)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const variantLabel =
    INSTITUTIONAL_VARIANTS.find((v) => v.value === variant)?.label ?? "Institucional"

  const updateItem = (i: number, patch: Partial<InstitutionalItem>) =>
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const removeItem = (i: number) => setItems((cur) => cur.filter((_, idx) => idx !== i))
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    setItems(next)
  }
  const addItem = () =>
    setItems((cur) => [...cur, { title: "", body: "", iconName: null, imageUrl: null, meta: null }])

  const save = async () => {
    setError(null)
    setSaving(true)
    const res = await fetch(`${apiBase}/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          kind: "institutional",
          variant,
          title: title.trim(),
          subtitle: subtitle.trim(),
          body: body.trim(),
          imageUrl: imageUrl.trim() || null,
          buttonText: buttonText.trim() || null,
          buttonHref: buttonHref.trim() || null,
          secondaryButtonText: secondaryButtonText.trim() || null,
          secondaryButtonHref: secondaryButtonHref.trim() || null,
          items,
        },
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? "Erro ao salvar")
      return
    }
    onChanged()
  }

  return (
    <CardShell
      index={index}
      total={total}
      isLocked={false}
      enabled={section.enabled}
      onReorder={onReorder}
      onToggleEnabled={async () => {
        const res = await fetch(`${apiBase}/${section.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !section.enabled }),
        })
        if (res.ok) onChanged()
      }}
      onDelete={async () => {
        if (!confirm(`Remover este bloco?`)) return
        const res = await fetch(`${apiBase}/${section.id}`, { method: "DELETE" })
        if (res.ok) onChanged()
      }}
      badge={`Institucional · ${variantLabel}`}
      title={title}
      subtitle={subtitle}
    >
      <div>
        <Label className="text-xs font-semibold">Layout</Label>
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value as InstitutionalVariant)}
          className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
        >
          {INSTITUTIONAL_VARIANTS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FieldText label="Título" value={title} onChange={setTitle} maxLength={120} />
        <FieldText
          label="Sobretítulo (categoria/sello)"
          value={subtitle}
          onChange={setSubtitle}
          maxLength={200}
        />
      </div>

      <div className="mt-3">
        <Label className="text-xs font-semibold">Texto descritivo</Label>
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          className="mt-1.5"
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FieldText
          label="URL da imagem (opcional)"
          value={imageUrl}
          onChange={setImageUrl}
          placeholder="https://…"
        />
        <span />
        <FieldText label="Texto do botão" value={buttonText} onChange={setButtonText} maxLength={60} />
        <FieldText label="Link do botão" value={buttonHref} onChange={setButtonHref} placeholder="/cursos" />
        <FieldText
          label="Botão secundário (texto)"
          value={secondaryButtonText}
          onChange={setSecondaryButtonText}
          maxLength={60}
        />
        <FieldText
          label="Botão secundário (link)"
          value={secondaryButtonHref}
          onChange={setSecondaryButtonHref}
          placeholder="/como-funciona"
        />
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs font-semibold">
            Itens internos ({items.length})
          </Label>
          <Button size="sm" variant="outline" type="button" onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar item
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-[11px] text-gray-500">
            Sem itens. Use para benefícios, depoimentos, bullets etc.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={it.title}
                    onChange={(e) => updateItem(i, { title: e.target.value })}
                    placeholder="Título / Nome"
                    maxLength={120}
                  />
                  <Input
                    value={it.body}
                    onChange={(e) => updateItem(i, { body: e.target.value })}
                    placeholder="Texto / depoimento"
                    maxLength={600}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(i, -1)}
                      disabled={i === 0}
                      className="rounded border border-gray-200 p-1 disabled:opacity-40"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(i, 1)}
                      disabled={i === items.length - 1}
                      className="rounded border border-gray-200 p-1 disabled:opacity-40"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <select
                    value={it.iconName ?? ""}
                    onChange={(e) => updateItem(i, { iconName: e.target.value || null })}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="">— Ícone —</option>
                    {LUCIDE_ICONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <Input
                    value={it.imageUrl ?? ""}
                    onChange={(e) => updateItem(i, { imageUrl: e.target.value || null })}
                    placeholder="URL da imagem (opcional)"
                    className="text-xs"
                  />
                  <Input
                    value={it.meta ?? ""}
                    onChange={(e) => updateItem(i, { meta: e.target.value || null })}
                    placeholder="Cargo/local (opcional)"
                    maxLength={120}
                    className="text-xs"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ErrorAndSave error={error} saving={saving} onSave={() => void save()} />
    </CardShell>
  )
}

// ---------------------------------------------------------------------------
// Atomos
// ---------------------------------------------------------------------------

function FieldText({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div>
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1.5"
      />
    </div>
  )
}

function ErrorAndSave({
  error,
  saving,
  onSave,
}: {
  error: string | null
  saving: boolean
  onSave: () => void
}) {
  return (
    <>
      {error && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={onSave}
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
              Salvar
            </>
          )}
        </Button>
      </div>
    </>
  )
}
