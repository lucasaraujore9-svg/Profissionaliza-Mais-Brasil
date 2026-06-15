"use client"

import { useEffect, useState } from "react"
import {
  Dices,
  ExternalLink,
  GraduationCap,
  Hand,
  Info,
  Loader2,
  Lock,
  Save,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  TecnicaCoursesEditor,
  type TecnicaCourseDraft,
} from "@/components/admin/tecnica-courses-editor"
import { CoursePicker } from "./course-picker"
import { cn } from "@/lib/utils"
import type {
  AnySectionConfig,
  BestsellersConfig,
  CategoriesGridConfig,
  CategoryCoursesConfig,
  CategoryOption,
  CourseOption,
  InstitutionalConfig,
  SectionCount,
  SectionMode,
  SectionRecord,
} from "./use-home-sections"

// ---------------------------------------------------------------------------
// SegmentedControl: 2 ou 4 botões "pill" com seleção visual clara
// ---------------------------------------------------------------------------

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; sub?: string; icon?: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid w-full grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md px-3 py-2 text-center text-sm font-semibold transition",
              active
                ? "bg-white text-[var(--color-pmb-green)] shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            <span className="flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
            {opt.sub && (
              <span className="text-[11px] font-normal text-zinc-500">
                {opt.sub}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TitleSubtitle (collapsible)
// ---------------------------------------------------------------------------

function TitleSubtitleEditor({
  title,
  subtitle,
  onTitleChange,
  onSubtitleChange,
  placeholderTitle,
}: {
  title: string
  subtitle: string
  onTitleChange: (v: string) => void
  onSubtitleChange: (v: string) => void
  placeholderTitle?: string
}) {
  const [open, setOpen] = useState(Boolean(title || subtitle))
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
      >
        <span>{open ? "▾" : "▸"} Personalizar título e descrição (opcional)</span>
        <span className="text-[11px] font-normal text-zinc-400">
          {title || subtitle ? "Personalizado" : "Padrão"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-100 p-3">
          <div>
            <Label className="mb-1.5 block text-xs">Título</Label>
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={placeholderTitle ?? "Deixe vazio para usar o padrão"}
              maxLength={80}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Descrição curta</Label>
            <Input
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              placeholder="Aparece logo abaixo do título"
              maxLength={140}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CourseSelectionEditor — usado por bestsellers e category_courses
// ---------------------------------------------------------------------------

function CourseSelectionEditor({
  config,
  courses,
  onChange,
}: {
  config: BestsellersConfig | CategoryCoursesConfig
  courses: CourseOption[]
  onChange: (
    patch: Partial<BestsellersConfig | CategoryCoursesConfig>,
  ) => void
}) {
  // "Mais vendidos" é padronizada em 4 cursos: não expõe o seletor de
  // quantidade e coage o config para 4 (cobrindo seções antigas com count=8).
  const isBestsellers = config.kind === "bestsellers"
  useEffect(() => {
    if (isBestsellers && config.count !== 4) {
      onChange({ count: 4, courseIds: config.courseIds.slice(0, 4) })
    }
  }, [isBestsellers, config.count, config.courseIds, onChange])

  return (
    <div className="space-y-4">
      {/* Modo */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Como escolher os cursos?
          </Label>
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="text-zinc-400 hover:text-zinc-600"
              aria-label="Ajuda"
            >
              <Info className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              No <b>Aleatório</b>, o sistema escolhe sozinho — você não precisa
              atualizar nada. No <b>Personalizado</b>, você escolhe exatamente
              quais cursos aparecem.
            </TooltipContent>
          </Tooltip>
        </div>
        <Segmented<SectionMode>
          value={config.mode}
          onChange={(v) => onChange({ mode: v })}
          ariaLabel="Modo de escolha"
          options={[
            {
              value: "random",
              label: "Aleatório",
              sub: "O sistema escolhe",
              icon: <Dices className="h-4 w-4" aria-hidden />,
            },
            {
              value: "manual",
              label: "Personalizado",
              sub: "Você escolhe",
              icon: <Hand className="h-4 w-4" aria-hidden />,
            },
          ]}
        />
      </div>

      {/* Quantidade — bestsellers é fixo em 4; categorias escolhem 4 ou 8. */}
      {isBestsellers ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Quantos cursos mostrar?
          </Label>
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">
            A seção <b>Mais vendidos da semana</b> exibe sempre{" "}
            <b>4 cursos</b>, mantendo o padrão da vitrine.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Quantos cursos mostrar?
          </Label>
          <Segmented<SectionCount>
            value={config.count}
            onChange={(v) =>
              onChange({
                count: v,
                // Ao reduzir, mantém apenas os primeiros N selecionados.
                courseIds: config.courseIds.slice(0, v),
              })
            }
            ariaLabel="Quantidade"
            options={[
              { value: 4, label: "4 cursos", sub: "Compacto" },
              { value: 8, label: "8 cursos", sub: "Em destaque" },
            ]}
          />
        </div>
      )}

      {/* Modo aleatório: aviso explicativo */}
      {config.mode === "random" && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-green)]/5 px-3 py-2.5 text-sm text-[var(--color-pmb-green-900)]">
          <Dices className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" aria-hidden />
          <p>
            A cada visita, o sistema mostra cursos diferentes
            {config.kind === "category_courses"
              ? " dessa categoria"
              : " mais vendidos da semana"}
            . Você não precisa atualizar nada.
          </p>
        </div>
      )}

      {/* Modo personalizado: picker */}
      {config.mode === "manual" && (
        <CoursePicker
          selectedIds={config.courseIds}
          required={config.count}
          courses={courses}
          onChange={(ids) => onChange({ courseIds: ids })}
          hint={
            config.kind === "category_courses"
              ? "Mostrando apenas cursos desta categoria"
              : "Mostrando cursos do catálogo completo"
          }
        />
      )}

      <TitleSubtitleEditor
        title={config.title}
        subtitle={config.subtitle}
        onTitleChange={(v) => onChange({ title: v })}
        onSubtitleChange={(v) => onChange({ subtitle: v })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editors por kind
// ---------------------------------------------------------------------------

export function BestsellersEditor({
  section,
  options,
  onPatch,
}: {
  section: SectionRecord
  options: { courses: CourseOption[] }
  onPatch: (patch: Partial<AnySectionConfig>) => void
}) {
  const config = section.config as BestsellersConfig
  return (
    <CourseSelectionEditor
      config={config}
      courses={options.courses}
      onChange={(p) => onPatch(p as Partial<AnySectionConfig>)}
    />
  )
}

export function CategoryCoursesEditor({
  section,
  options,
  onPatch,
}: {
  section: SectionRecord
  options: { courses: CourseOption[] }
  onPatch: (patch: Partial<AnySectionConfig>) => void
}) {
  const config = section.config as CategoryCoursesConfig
  const filtered = options.courses.filter((c) =>
    c.categoryIds.includes(config.categoryId),
  )
  return (
    <CourseSelectionEditor
      config={config}
      courses={filtered}
      onChange={(p) => onPatch(p as Partial<AnySectionConfig>)}
    />
  )
}

export function CategoriesGridEditor({
  section,
  options,
  onPatch,
}: {
  section: SectionRecord
  options: { categories: CategoryOption[] }
  onPatch: (patch: Partial<AnySectionConfig>) => void
}) {
  const config = section.config as CategoriesGridConfig
  const selected = new Set(config.categoryIds)

  function toggle(id: string) {
    const next = selected.has(id)
      ? config.categoryIds.filter((x) => x !== id)
      : [...config.categoryIds, id]
    onPatch({ categoryIds: next } as Partial<AnySectionConfig>)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-green)]/5 px-3 py-2.5 text-sm text-[var(--color-pmb-green-900)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" aria-hidden />
        <p>
          Escolha quais categorias aparecem na grade da home. Sem nenhuma
          marcada, o sistema mostra <b>todas</b>.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Categorias visíveis
        </Label>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {options.categories.map((c) => {
            const active = selected.has(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
                    active
                      ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/5 text-[var(--color-pmb-green-900)]"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                  )}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[11px] text-zinc-500">
                    {c.courseCount} cursos
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <TitleSubtitleEditor
        title={config.title}
        subtitle={config.subtitle}
        onTitleChange={(v) =>
          onPatch({ title: v } as Partial<AnySectionConfig>)
        }
        onSubtitleChange={(v) =>
          onPatch({ subtitle: v } as Partial<AnySectionConfig>)
        }
        placeholderTitle="Qual profissão você quer aprender?"
      />
    </div>
  )
}

export function InstitutionalEditor({
  section,
  onPatch,
}: {
  section: SectionRecord
  onPatch: (patch: Partial<AnySectionConfig>) => void
}) {
  const config = section.config as InstitutionalConfig

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Bloco institucional do tipo <b>{labelOfVariant(config.variant)}</b>.
          Para layouts complexos (depoimentos, lista de itens), use as opções
          completas no admin avançado.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs">Título</Label>
          <Input
            value={config.title}
            onChange={(e) =>
              onPatch({ title: e.target.value } as Partial<AnySectionConfig>)
            }
            placeholder="Título grande do bloco"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Subtítulo</Label>
          <Input
            value={config.subtitle}
            onChange={(e) =>
              onPatch({ subtitle: e.target.value } as Partial<AnySectionConfig>)
            }
            placeholder="Linha curta acima ou abaixo do título"
          />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs">Texto principal</Label>
        <Textarea
          value={config.body}
          onChange={(e) =>
            onPatch({ body: e.target.value } as Partial<AnySectionConfig>)
          }
          placeholder="Mensagem que aparece no bloco"
          rows={3}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs">Texto do botão</Label>
          <Input
            value={config.buttonText ?? ""}
            onChange={(e) =>
              onPatch({
                buttonText: e.target.value || null,
              } as Partial<AnySectionConfig>)
            }
            placeholder="Ex.: Conhecer os cursos"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Link do botão</Label>
          <Input
            value={config.buttonHref ?? ""}
            onChange={(e) =>
              onPatch({
                buttonHref: e.target.value || null,
              } as Partial<AnySectionConfig>)
            }
            placeholder="/cursos ou https://..."
          />
        </div>
      </div>
    </div>
  )
}

function labelOfVariant(v: InstitutionalConfig["variant"]) {
  switch (v) {
    case "trust_bar":
      return "Barra de benefícios"
    case "learn_anywhere":
      return "Texto + imagem + chamada"
    case "testimonials":
      return "Depoimentos"
    case "final_cta":
      return "Chamada final"
    case "benefits":
      return "Grid de benefícios"
    case "custom":
    default:
      return "Personalizado"
  }
}

// ---------------------------------------------------------------------------
// TecnicaEditor — seção "Cursos Técnicos"
//
// Diferente das outras seções, o conteúdo (cursos/imagens/URL/rótulo) NÃO vive
// no `config` do HomeSection: vive em SystemSettings.tecnica*, fonte única que
// a tela /admin/configuracoes/unidade-tecnica também edita. Por isso este
// editor é autossuficiente (busca e salva no endpoint próprio), sem usar o
// fluxo de draft/Salvar genérico da lista de seções.
//
// - Admin (canEdit=true): edita os 8 cursos + URL base + rótulo.
// - Unidade (canEdit=false): card informativo read-only (só reordena/liga-desliga
//   pelo cabeçalho da seção).
// ---------------------------------------------------------------------------

const TECNICA_SECTION_COUNT = 8

export function TecnicaEditor({ canEdit }: { canEdit: boolean }) {
  if (!canEdit) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-green)]/5 px-3 py-2.5 text-sm text-[var(--color-pmb-green-900)]">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" aria-hidden />
        <p>
          A lista de cursos e as imagens da seção <b>Cursos Técnicos</b> são
          padronizadas pela administração. O <b>link de destino</b> é o da sua
          unidade (configurado pelo seu gestor). Aqui você só pode{" "}
          <b>posicionar</b> e <b>ligar/desligar</b> a seção na sua vitrine, pelo
          cabeçalho acima.
        </p>
      </div>
    )
  }
  return <TecnicaAdminEditor />
}

function TecnicaAdminEditor() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // `enabled` (flag de menu/categoria do site) é preservado: este editor só
  // mexe no conteúdo. A exibição da seção na home é o toggle do cabeçalho.
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState("")
  const [label, setLabel] = useState("")
  const [courses, setCourses] = useState<TecnicaCourseDraft[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch("/api/admin/system-settings/tecnica", {
          cache: "no-store",
        })
        if (!res.ok) throw new Error("Falha ao carregar os cursos técnicos")
        const body = await res.json()
        const d = body.data as {
          tecnicaEnabled: boolean
          tecnicaUrl: string | null
          tecnicaLabel: string | null
          tecnicaCourses: unknown
        }
        if (!alive) return
        setEnabled(Boolean(d.tecnicaEnabled))
        setUrl(d.tecnicaUrl ?? "")
        setLabel(d.tecnicaLabel ?? "")
        const list = Array.isArray(d.tecnicaCourses) ? d.tecnicaCourses : []
        setCourses(
          list.map((c) => {
            const o = (c ?? {}) as Record<string, unknown>
            return {
              name: typeof o.name === "string" ? o.name : "",
              url: typeof o.url === "string" ? o.url : "",
              image: typeof o.image === "string" ? o.image : "",
            }
          }),
        )
      } catch (err) {
        if (alive)
          setLoadError(
            err instanceof Error ? err.message : "Erro ao carregar",
          )
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function save() {
    const trimmedUrl = url.trim()
    const filled = courses.filter((c) => c.name.trim())
    if (filled.length !== 0 && filled.length !== TECNICA_SECTION_COUNT) {
      toast.error(
        `Cadastre exatamente ${TECNICA_SECTION_COUNT} cursos (ou nenhum). Você tem ${filled.length} preenchido(s).`,
      )
      return
    }
    if (filled.length > 0 && !trimmedUrl) {
      toast.error("Informe a URL base da escola técnica.")
      return
    }
    if (trimmedUrl) {
      try {
        new URL(trimmedUrl)
      } catch {
        toast.error("URL base inválida (use https://...)")
        return
      }
    }
    for (let i = 0; i < filled.length; i++) {
      const c = filled[i]
      if (c.url.trim()) {
        try {
          new URL(c.url.trim())
        } catch {
          toast.error(`Curso #${i + 1}: URL inválida`)
          return
        }
      }
    }

    setSaving(true)
    ;(async () => {
      try {
        const res = await fetch("/api/admin/system-settings/tecnica", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            // Preserva o flag de menu/categoria — este editor só toca conteúdo.
            enabled,
            url: trimmedUrl || null,
            label: label.trim() || null,
            courses: filled.map((c, i) => ({
              name: c.name.trim(),
              url: c.url.trim(),
              image: c.image?.trim() || "",
              order: i,
            })),
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(body.error ?? "Falha ao salvar")
          return
        }
        toast.success("Cursos Técnicos salvos")
      } catch {
        toast.error("Erro ao salvar")
      } finally {
        setSaving(false)
      }
    })()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando cursos técnicos…
      </div>
    )
  }
  if (loadError) {
    return (
      <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
        {loadError}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-green)]/5 px-3 py-2.5 text-sm text-[var(--color-pmb-green-900)]">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" aria-hidden />
        <p>
          Esta lista é <b>padronizada para toda a rede</b> — vale para o site
          PMB e para todas as vitrines de revendedor. A seção exibe{" "}
          <b>{TECNICA_SECTION_COUNT} cursos</b>. (Liga/desliga e ativação do
          menu institucional ficam no cabeçalho e em{" "}
          <i>Configurações → Unidade Técnica</i>.)
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs">URL base da escola técnica</Label>
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://escolatecnicadobrasil.com.br/"
              disabled={saving}
            />
            {url.trim() && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-gray-200 bg-white p-2 text-gray-500 hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green)]"
                title="Testar link"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Rótulo (opcional)</Label>
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Cursos Técnicos"
            maxLength={60}
            disabled={saving}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-4">
        <TecnicaCoursesEditor
          courses={courses}
          onChange={setCourses}
          fallbackUrl={url.trim() || null}
          disabled={saving}
        />
      </div>

      <div className="-mx-4 -mb-4 flex items-center justify-end border-t border-[rgba(2,89,24,0.08)] bg-white px-4 py-3">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden />
          )}
          {saving ? "Salvando..." : "Salvar cursos"}
        </Button>
      </div>
    </div>
  )
}
