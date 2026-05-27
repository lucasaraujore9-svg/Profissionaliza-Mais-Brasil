"use client"

import { AlertCircle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SectionList } from "./section-list"
import { useHomeSections } from "./use-home-sections"

interface HomeSectionsPanelProps {
  /** Base sem trailing slash: "/api/admin/home-sections" ou "/api/painel/home-sections". */
  apiBase: string
  /** Mostrado no topo do card como dica em 1 linha. */
  hint?: string
}

export function HomeSectionsPanel({ apiBase, hint }: HomeSectionsPanelProps) {
  const {
    sections,
    options,
    loading,
    loadError,
    reload,
    toggleEnabled,
    move,
    reorder,
    removeSection,
    drafts,
    savingIds,
    startEditingDraft,
    patchDraft,
    saveDraft,
    discardDraft,
  } = useHomeSections({ apiBase })

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {hint && (
          <div className="rounded-lg border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-green)]/5 px-3 py-2.5 text-sm text-[var(--color-pmb-green-900)]">
            {hint}
          </div>
        )}

        {loading && !sections && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton
                key={i}
                className="h-14 w-full rounded-xl bg-zinc-100"
              />
            ))}
          </div>
        )}

        {loadError && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-medium">Não consegui carregar as seções.</p>
              <p className="mt-0.5 text-xs">{loadError}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className="shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Tentar de novo
            </Button>
          </div>
        )}

        {sections && options && (
          <SectionList
            sections={sections}
            options={options}
            onToggleEnabled={toggleEnabled}
            onMove={move}
            onReorder={reorder}
            onRemove={removeSection}
            drafts={drafts}
            savingIds={savingIds}
            onStartEditing={startEditingDraft}
            onPatchDraft={patchDraft}
            onSaveDraft={saveDraft}
            onDiscardDraft={discardDraft}
          />
        )}

        {loading && sections && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Atualizando…
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
