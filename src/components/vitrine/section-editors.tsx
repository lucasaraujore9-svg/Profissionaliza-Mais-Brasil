"use client"

import { useState } from "react"
import { Dices, Hand, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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

      {/* Quantidade */}
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
  const filtered = options.courses.filter(
    (c) => c.categoryId === config.categoryId,
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
