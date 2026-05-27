"use client"

import { useMemo, useState } from "react"
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Loader2,
  Lock,
  Megaphone,
  Save,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  BestsellersEditor,
  CategoriesGridEditor,
  CategoryCoursesEditor,
  InstitutionalEditor,
} from "./section-editors"
import type {
  AnySectionConfig,
  BestsellersConfig,
  CategoriesGridConfig,
  CategoryCoursesConfig,
  CategoryOption,
  InstitutionalConfig,
  SectionOptions,
  SectionRecord,
} from "./use-home-sections"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Lista de sanfonas
// ---------------------------------------------------------------------------

interface SectionListProps {
  sections: SectionRecord[]
  options: SectionOptions
  onToggleEnabled: (id: string, enabled: boolean) => void
  onMove: (id: string, delta: -1 | 1) => void
  onReorder: (nextOrder: string[]) => void
  /** Draft API: drafts[id] existe => seção em edição. */
  drafts: Record<string, AnySectionConfig>
  savingIds: Set<string>
  onStartEditing: (id: string) => void
  onPatchDraft: (id: string, patch: Partial<AnySectionConfig>) => void
  onSaveDraft: (id: string) => Promise<boolean>
  onDiscardDraft: (id: string) => void
}

export function SectionList({
  sections,
  options,
  onToggleEnabled,
  onMove,
  onReorder,
  drafts,
  savingIds,
  onStartEditing,
  onPatchDraft,
  onSaveDraft,
  onDiscardDraft,
}: SectionListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const categoryById = useMemo(
    () => new Map(options.categories.map((c) => [c.id, c])),
    [options.categories],
  )

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null)
      setOverId(null)
      return
    }
    const ids = sections.map((s) => s.id)
    const from = ids.indexOf(draggingId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    onReorder(next)
    setDraggingId(null)
    setOverId(null)
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-10 text-center">
        <Layers className="mx-auto h-8 w-8 text-zinc-300" aria-hidden />
        <p className="mt-3 text-sm font-medium text-zinc-700">
          Você ainda não tem seções configuradas.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Crie uma categoria em <b>Catálogo → Categorias</b> e ela vai aparecer
          aqui como uma seção pronta pra ativar.
        </p>
      </div>
    )
  }

  return (
    <Accordion
      multiple
      onValueChange={(open) => {
        // base-ui devolve string | string[]; multiple => array
        const opened = Array.isArray(open) ? open : open ? [open] : []
        for (const id of opened) {
          if (typeof id === "string") onStartEditing(id)
        }
      }}
    >
      {sections.map((s, index) => {
        const isLocked = s.kind === "bestsellers"
        const canMoveUp = index > 0 && !isLocked && !(index === 1 && sections[0]?.kind === "bestsellers")
        const canMoveDown = index < sections.length - 1
        const isDragging = draggingId === s.id
        const isOver = overId === s.id && draggingId !== s.id
        const categoryName =
          s.kind === "category_courses"
            ? categoryById.get(
                (s.config as CategoryCoursesConfig).categoryId,
              )?.name
            : undefined
        // Draft em edição. Se não existe, mostra config persistida (read-only
        // até abrir a sanfona, que dispara onStartEditing).
        const draft = drafts[s.id]
        const isDirty = Boolean(draft)
        const isSaving = savingIds.has(s.id)
        const effectiveConfig = draft ?? s.config
        const sectionForEditor: SectionRecord = isDirty
          ? { ...s, config: effectiveConfig }
          : s
        const validation = validateLocal(effectiveConfig)

        return (
          <AccordionItem
            key={s.id}
            value={s.id}
            data-dragging={isDragging || undefined}
            data-over={isOver || undefined}
            className={cn(
              "transition-all",
              isDragging && "opacity-50",
              isOver && "ring-2 ring-[var(--color-pmb-green)]/40",
              !s.enabled && "opacity-75",
            )}
            onDragOver={(e) => {
              e.preventDefault()
              if (draggingId && draggingId !== s.id) setOverId(s.id)
            }}
            onDragLeave={() => {
              if (overId === s.id) setOverId(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(s.id)
            }}
          >
            <AccordionHeader>
              <div className="flex flex-1 items-center gap-2 pl-2 pr-2 sm:pl-3">
                {/* Drag handle */}
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    draggable={!isLocked}
                    onDragStart={() => setDraggingId(s.id)}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverId(null)
                    }}
                    disabled={isLocked}
                    className={cn(
                      "hidden h-8 w-6 shrink-0 cursor-grab place-items-center text-zinc-400 sm:grid",
                      isLocked && "cursor-not-allowed opacity-40",
                      isDragging && "cursor-grabbing",
                    )}
                    aria-label={
                      isLocked
                        ? "Esta seção é fixa e não pode ser movida"
                        : "Arraste para reordenar na home"
                    }
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent>
                    {isLocked
                      ? "Esta seção é fixa — sempre 1ª na home"
                      : "Arraste para reordenar"}
                  </TooltipContent>
                </Tooltip>

                {/* Toggle on/off ou Lock */}
                {isLocked ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="grid h-8 w-8 cursor-not-allowed place-items-center rounded-full bg-zinc-100 text-zinc-400"
                      aria-label="Seção sempre ativa"
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent>
                      A seção <b>Mais vendidos da semana</b> sempre aparece — não
                      pode desativar.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleEnabled(s.id, !s.enabled)
                      }}
                      className="shrink-0"
                      aria-label={
                        s.enabled
                          ? "Desativar esta seção na home"
                          : "Ativar esta seção na home"
                      }
                    >
                      <Switch checked={s.enabled} />
                    </TooltipTrigger>
                    <TooltipContent>
                      {s.enabled
                        ? "Clique para desativar — esta seção não vai mais aparecer na home"
                        : "Clique para ativar — esta seção vai aparecer na home"}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Trigger (cabeçalho clicável que abre a sanfona) */}
                <AccordionTrigger className="flex-1 px-0 hover:bg-transparent">
                  <div className="flex flex-1 items-center gap-3 text-left">
                    <SectionIcon kind={s.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-zinc-800">
                        <span className="truncate">
                          {titleOfSection({ ...s, config: effectiveConfig }, categoryName)}
                        </span>
                        {isDirty && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Não salvo
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11.5px] text-zinc-500">
                        {summaryOfSection({ ...s, config: effectiveConfig })}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                {/* Botões ↑↓ (mobile-first + leigos) */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMove(s.id, -1)
                      }}
                      disabled={!canMoveUp}
                      className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Mover para cima"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>Mover para cima</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMove(s.id, 1)
                      }}
                      disabled={!canMoveDown}
                      className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Mover para baixo"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>Mover para baixo</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </AccordionHeader>

            <AccordionContent>
              <div className="space-y-4">
                <EditorForKind
                  section={sectionForEditor}
                  options={options}
                  onPatch={(patch) => onPatchDraft(s.id, patch)}
                />

                {/* Footer: estado + ações Salvar/Cancelar */}
                <div className="-mx-4 -mb-4 flex flex-col items-stretch gap-3 border-t border-[rgba(2,89,24,0.08)] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <SaveStatus
                    isDirty={isDirty}
                    isSaving={isSaving}
                    validationError={validation.ok ? null : validation.error}
                  />
                  <div className="flex shrink-0 gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isDirty || isSaving}
                      onClick={() => onDiscardDraft(s.id)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!isDirty || isSaving || !validation.ok}
                      onClick={() => void onSaveDraft(s.id)}
                      className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
                    >
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Save className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function SectionIcon({ kind }: { kind: SectionRecord["kind"] }) {
  const map: Record<SectionRecord["kind"], { icon: typeof Sparkles; bg: string; fg: string }> = {
    bestsellers: {
      icon: Sparkles,
      bg: "bg-amber-100",
      fg: "text-amber-600",
    },
    category_courses: {
      icon: BookOpen,
      bg: "bg-[var(--color-pmb-green)]/10",
      fg: "text-[var(--color-pmb-green)]",
    },
    categories_grid: {
      icon: Layers,
      bg: "bg-sky-100",
      fg: "text-sky-600",
    },
    institutional: {
      icon: Megaphone,
      bg: "bg-violet-100",
      fg: "text-violet-600",
    },
  }
  const { icon: Icon, bg, fg } = map[kind]
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
        bg,
      )}
    >
      <Icon className={cn("h-4 w-4", fg)} aria-hidden />
    </span>
  )
}

function titleOfSection(
  s: SectionRecord,
  categoryName?: string,
): string {
  switch (s.kind) {
    case "bestsellers":
      return (
        (s.config as BestsellersConfig).title ||
        "Cursos mais vendidos da semana"
      )
    case "category_courses": {
      const c = s.config as CategoryCoursesConfig
      return c.title || `Cursos de ${categoryName ?? "categoria"}`
    }
    case "categories_grid":
      return (
        (s.config as CategoriesGridConfig).title ||
        "Qual profissão você quer aprender?"
      )
    case "institutional": {
      const c = s.config as InstitutionalConfig
      return c.title || labelOfVariant(c.variant)
    }
  }
}

function summaryOfSection(s: SectionRecord): string {
  if (!s.enabled) return "Desativada — não aparece na home"
  switch (s.kind) {
    case "bestsellers":
    case "category_courses": {
      const c = s.config as BestsellersConfig | CategoryCoursesConfig
      const modeLabel = c.mode === "random" ? "Aleatório" : "Personalizado"
      const countLabel = `${c.count} cursos`
      if (c.mode === "manual" && c.courseIds.length < c.count) {
        return `${modeLabel} · ${c.courseIds.length}/${c.count} selecionados — escolha mais ${c.count - c.courseIds.length}`
      }
      return `${modeLabel} · ${countLabel}`
    }
    case "categories_grid": {
      const c = s.config as CategoriesGridConfig
      return c.categoryIds.length === 0
        ? "Mostrando todas as categorias"
        : `Mostrando ${c.categoryIds.length} categoria(s)`
    }
    case "institutional": {
      const c = s.config as InstitutionalConfig
      return `Bloco: ${labelOfVariant(c.variant)}`
    }
  }
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
// Validação local (antes de habilitar "Salvar"). Espelha as regras do
// servidor pra evitar round-trips inúteis.
// ---------------------------------------------------------------------------

type LocalValidation = { ok: true } | { ok: false; error: string }

function validateLocal(config: AnySectionConfig): LocalValidation {
  if (config.kind === "bestsellers" || config.kind === "category_courses") {
    if (config.mode === "manual" && config.courseIds.length !== config.count) {
      const diff = config.count - config.courseIds.length
      if (diff > 0) {
        return {
          ok: false,
          error: `No modo personalizado, selecione exatamente ${config.count} cursos (faltam ${diff})`,
        }
      }
      return {
        ok: false,
        error: `Você selecionou ${config.courseIds.length} cursos, mas o limite é ${config.count}`,
      }
    }
  }
  return { ok: true }
}

function SaveStatus({
  isDirty,
  isSaving,
  validationError,
}: {
  isDirty: boolean
  isSaving: boolean
  validationError: string | null
}) {
  if (isSaving) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Salvando alterações...
      </p>
    )
  }
  if (validationError) {
    return (
      <p className="text-xs font-medium text-amber-700">{validationError}</p>
    )
  }
  if (isDirty) {
    return (
      <p className="text-xs text-zinc-500">
        Você tem alterações não salvas.
      </p>
    )
  }
  return (
    <p className="text-xs text-zinc-400">
      Tudo salvo. Edite os campos acima e clique em <b>Salvar</b>.
    </p>
  )
}

function EditorForKind({
  section,
  options,
  onPatch,
}: {
  section: SectionRecord
  options: SectionOptions
  onPatch: (patch: Partial<AnySectionConfig>) => void
}) {
  switch (section.kind) {
    case "bestsellers":
      return (
        <BestsellersEditor
          section={section}
          options={{ courses: options.courses }}
          onPatch={onPatch}
        />
      )
    case "category_courses":
      return (
        <CategoryCoursesEditor
          section={section}
          options={{ courses: options.courses }}
          onPatch={onPatch}
        />
      )
    case "categories_grid":
      return (
        <CategoriesGridEditor
          section={section}
          options={{ categories: options.categories as CategoryOption[] }}
          onPatch={onPatch}
        />
      )
    case "institutional":
      return <InstitutionalEditor section={section} onPatch={onPatch} />
  }
}
