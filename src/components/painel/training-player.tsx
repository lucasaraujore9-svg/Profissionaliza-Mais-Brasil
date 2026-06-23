"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Circle,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { youtubeEmbedUrl } from "@/lib/training/youtube"

export interface PlayerVideo {
  id: string
  title: string
  description: string | null
  youtubeId: string
  durationLabel: string | null
  completed: boolean
}

export function TrainingPlayer({
  moduleTitle,
  moduleDescription,
  videos: initialVideos,
  progressPath = "/api/painel/treinamentos/progress",
}: {
  moduleTitle: string
  moduleDescription: string | null
  videos: PlayerVideo[]
  /** Endpoint de progresso. Revenda usa /api/painel/...; equipe PMB usa /api/admin/treinamentos/progress. */
  progressPath?: string
}) {
  const [videos, setVideos] = useState(initialVideos)
  // Começa na primeira aula não concluída (continuar de onde parou).
  const firstUnwatched = initialVideos.findIndex((v) => !v.completed)
  const [activeIndex, setActiveIndex] = useState(firstUnwatched === -1 ? 0 : firstUnwatched)
  const [saving, setSaving] = useState(false)

  const active = videos[activeIndex]
  const completedCount = useMemo(() => videos.filter((v) => v.completed).length, [videos])
  const pct = Math.round((completedCount / videos.length) * 100)

  async function setCompleted(videoId: string, completed: boolean) {
    setSaving(true)
    // Optimistic.
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, completed } : v)))
    try {
      const res = await fetch(progressPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, completed }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Reverte em erro.
      setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, completed: !completed } : v)))
      toast.error("Não foi possível salvar seu progresso")
    } finally {
      setSaving(false)
    }
  }

  function goTo(index: number) {
    if (index < 0 || index >= videos.length) return
    setActiveIndex(index)
  }

  async function completeAndNext() {
    if (!active.completed) await setCompleted(active.id, true)
    if (activeIndex < videos.length - 1) setActiveIndex(activeIndex + 1)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      {/* Player + detalhes */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
          <div className="relative aspect-video w-full">
            <iframe
              key={active.id}
              src={youtubeEmbedUrl(active.youtubeId)}
              title={active.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-pmb-green)]">
            {moduleTitle}
          </p>
          <h2 className="mt-1 text-xl font-bold text-gray-900">{active.title}</h2>
          {active.durationLabel && (
            <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <Clock className="h-3.5 w-3.5" /> {active.durationLabel}
            </p>
          )}
          {active.description && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {active.description}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            <Button
              variant={active.completed ? "outline" : "default"}
              size="sm"
              disabled={saving}
              onClick={() => setCompleted(active.id, !active.completed)}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : active.completed ? (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              ) : (
                <Circle className="mr-1.5 h-4 w-4" />
              )}
              {active.completed ? "Concluída" : "Marcar como concluída"}
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activeIndex === 0}
                onClick={() => goTo(activeIndex - 1)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              {activeIndex < videos.length - 1 ? (
                <Button size="sm" onClick={completeAndNext}>
                  Próxima <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={active.completed || saving}
                  onClick={() => setCompleted(active.id, true)}
                >
                  Concluir módulo
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lista de aulas */}
      <aside className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-900">Conteúdo do módulo</span>
            <span className="text-gray-500">
              {completedCount}/{videos.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[var(--color-pmb-green)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {moduleDescription && (
            <p className="mt-3 text-xs text-gray-500">{moduleDescription}</p>
          )}
        </div>
        <ol className="max-h-[60vh] divide-y divide-gray-50 overflow-y-auto">
          {videos.map((v, i) => {
            const isActive = i === activeIndex
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                    isActive ? "bg-[var(--color-pmb-green)]/5" : "hover:bg-gray-50",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {v.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-[var(--color-pmb-green)]" />
                    ) : isActive ? (
                      <PlayCircle className="h-5 w-5 text-[var(--color-pmb-green)]" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm",
                        isActive ? "font-semibold text-gray-900" : "font-medium text-gray-700",
                      )}
                    >
                      {i + 1}. {v.title}
                    </span>
                    {v.durationLabel && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" /> {v.durationLabel}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </aside>
    </div>
  )
}
