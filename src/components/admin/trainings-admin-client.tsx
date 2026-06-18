"use client"

import Image from "next/image"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Video as VideoIcon,
  Loader2,
  Clock,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { youtubeThumbUrl } from "@/lib/training/youtube"

interface TrainingVideo {
  id: string
  moduleId: string
  title: string
  description: string | null
  youtubeId: string
  durationLabel: string | null
  position: number
  published: boolean
}

interface TrainingModule {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  position: number
  published: boolean
  videos: TrainingVideo[]
  _count: { videos: number }
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.error ?? "Erro inesperado")
  }
  return json
}

export function TrainingsAdminClient() {
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Dialog state
  const [moduleDialog, setModuleDialog] = useState<{ open: boolean; editing: TrainingModule | null }>({
    open: false,
    editing: null,
  })
  const [videoDialog, setVideoDialog] = useState<{
    open: boolean
    moduleId: string | null
    editing: TrainingVideo | null
  }>({ open: false, moduleId: null, editing: null })
  const [confirm, setConfirm] = useState<
    | { kind: "module"; id: string; label: string }
    | { kind: "video"; id: string; label: string }
    | null
  >(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await api("/api/admin/treinamentos/modules")
      setModules(json.data.modules)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function toggleModulePublished(m: TrainingModule) {
    setBusyId(m.id)
    try {
      await api(`/api/admin/treinamentos/modules/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: !m.published }),
      })
      toast.success(m.published ? "Módulo despublicado" : "Módulo publicado")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha")
    } finally {
      setBusyId(null)
    }
  }

  async function toggleVideoPublished(v: TrainingVideo) {
    setBusyId(v.id)
    try {
      await api(`/api/admin/treinamentos/videos/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: !v.published }),
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha")
    } finally {
      setBusyId(null)
    }
  }

  async function reorder(scope: "module" | "video", ids: string[]) {
    try {
      await api("/api/admin/treinamentos/reorder", {
        method: "POST",
        body: JSON.stringify({ scope, orderedIds: ids }),
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reordenar")
    }
  }

  function moveModule(index: number, dir: -1 | 1) {
    const next = [...modules]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setModules(next)
    void reorder("module", next.map((m) => m.id))
  }

  function moveVideo(m: TrainingModule, index: number, dir: -1 | 1) {
    const next = [...m.videos]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    void reorder("video", next.map((v) => v.id))
  }

  async function doDelete() {
    if (!confirm) return
    setBusyId(confirm.id)
    try {
      const url =
        confirm.kind === "module"
          ? `/api/admin/treinamentos/modules/${confirm.id}`
          : `/api/admin/treinamentos/videos/${confirm.id}`
      await api(url, { method: "DELETE" })
      toast.success("Removido")
      setConfirm(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 py-20 text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando treinamentos…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {modules.length} módulo{modules.length === 1 ? "" : "s"} ·{" "}
          {modules.reduce((acc, m) => acc + m._count.videos, 0)} treinamento(s)
        </p>
        <Button onClick={() => setModuleDialog({ open: true, editing: null })}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo módulo
        </Button>
      </div>

      {modules.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <VideoIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium text-gray-700">Nenhum módulo ainda</p>
          <p className="mt-1 text-sm text-gray-500">
            Crie o primeiro módulo para começar a organizar os treinamentos.
          </p>
          <Button className="mt-4" onClick={() => setModuleDialog({ open: true, editing: null })}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo módulo
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {modules.map((m, mi) => {
          const isOpen = expanded.has(m.id)
          return (
            <div key={m.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {/* Header do módulo */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveModule(mi, -1)}
                    disabled={mi === 0}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveModule(mi, 1)}
                    disabled={mi === modules.length - 1}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpand(m.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-green)]/10 font-bold text-[var(--color-pmb-green)]">
                    {mi + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{m.title}</p>
                    <p className="text-xs text-gray-500">
                      {m._count.videos} treinamento{m._count.videos === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>

                <Badge variant={m.published ? "default" : "secondary"}>
                  {m.published ? "Publicado" : "Rascunho"}
                </Badge>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === m.id}
                    onClick={() => toggleModulePublished(m)}
                    title={m.published ? "Despublicar" : "Publicar"}
                  >
                    {m.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModuleDialog({ open: true, editing: m })}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirm({ kind: "module", id: m.id, label: m.title })}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleExpand(m.id)}>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Corpo: lista de vídeos */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                  {m.description && (
                    <p className="mb-3 text-sm text-gray-600">{m.description}</p>
                  )}
                  <div className="space-y-2">
                    {m.videos.map((v, vi) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveVideo(m, vi, -1)}
                            disabled={vi === 0}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                            aria-label="Mover para cima"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveVideo(m, vi, 1)}
                            disabled={vi === m.videos.length - 1}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                            aria-label="Mover para baixo"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded bg-gray-200">
                          <Image
                            src={youtubeThumbUrl(v.youtubeId)}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{v.title}</p>
                          {v.durationLabel && (
                            <p className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="h-3 w-3" /> {v.durationLabel}
                            </p>
                          )}
                        </div>
                        {!v.published && (
                          <Badge variant="secondary" className="shrink-0">
                            Oculto
                          </Badge>
                        )}
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === v.id}
                            onClick={() => toggleVideoPublished(v)}
                            title={v.published ? "Ocultar" : "Exibir"}
                          >
                            {v.published ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setVideoDialog({ open: true, moduleId: m.id, editing: v })
                            }
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirm({ kind: "video", id: v.id, label: v.title })}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {m.videos.length === 0 && (
                      <p className="px-1 py-2 text-sm text-gray-400">
                        Nenhum treinamento neste módulo ainda.
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setVideoDialog({ open: true, moduleId: m.id, editing: null })}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar treinamento
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {moduleDialog.open && (
        <ModuleDialog
          editing={moduleDialog.editing}
          onClose={() => setModuleDialog({ open: false, editing: null })}
          onSaved={() => {
            setModuleDialog({ open: false, editing: null })
            void load()
          }}
        />
      )}

      {videoDialog.open && videoDialog.moduleId && (
        <VideoDialog
          moduleId={videoDialog.moduleId}
          editing={videoDialog.editing}
          onClose={() => setVideoDialog({ open: false, moduleId: null, editing: null })}
          onSaved={() => {
            setVideoDialog({ open: false, moduleId: null, editing: null })
            void load()
          }}
        />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {confirm?.kind === "module" ? "módulo" : "treinamento"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "module"
                ? `"${confirm?.label}" e todos os seus treinamentos serão removidos. Esta ação não pode ser desfeita.`
                : `"${confirm?.label}" será removido. Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ----------------------------- Module dialog ----------------------------- */

function ModuleDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: TrainingModule | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(editing?.title ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [coverUrl, setCoverUrl] = useState(editing?.coverUrl ?? "")
  const [published, setPublished] = useState(editing?.published ?? false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (title.trim().length < 2) {
      toast.error("Informe um título com ao menos 2 caracteres")
      return
    }
    setSaving(true)
    try {
      const body = JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        coverUrl: coverUrl.trim() || null,
        published,
      })
      if (editing) {
        await api(`/api/admin/treinamentos/modules/${editing.id}`, { method: "PATCH", body })
      } else {
        await api("/api/admin/treinamentos/modules", { method: "POST", body })
      }
      toast.success(editing ? "Módulo atualizado" : "Módulo criado")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar módulo" : "Novo módulo"}</DialogTitle>
          <DialogDescription>
            Agrupe treinamentos relacionados (ex: &quot;Primeiros passos&quot;, &quot;Vendas&quot;).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Título</Label>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Primeiros passos na plataforma"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Descrição (opcional)</Label>
            <Textarea
              id="m-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Do que este módulo trata?"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-cover">Imagem de capa — URL (opcional)</Label>
            <Input
              id="m-cover"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Publicar</p>
              <p className="text-xs text-gray-500">Visível para as unidades quando ligado.</p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ Video dialog ------------------------------ */

function VideoDialog({
  moduleId,
  editing,
  onClose,
  onSaved,
}: {
  moduleId: string
  editing: TrainingVideo | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(editing?.title ?? "")
  const [youtube, setYoutube] = useState(
    editing ? `https://www.youtube.com/watch?v=${editing.youtubeId}` : "",
  )
  const [description, setDescription] = useState(editing?.description ?? "")
  const [durationLabel, setDurationLabel] = useState(editing?.durationLabel ?? "")
  const [published, setPublished] = useState(editing?.published ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (title.trim().length < 2) {
      toast.error("Informe um título")
      return
    }
    if (youtube.trim().length < 1) {
      toast.error("Cole o link do YouTube")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api(`/api/admin/treinamentos/videos/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: title.trim(),
            youtube: youtube.trim(),
            description: description.trim() || null,
            durationLabel: durationLabel.trim() || null,
            published,
          }),
        })
      } else {
        await api("/api/admin/treinamentos/videos", {
          method: "POST",
          body: JSON.stringify({
            moduleId,
            title: title.trim(),
            youtube: youtube.trim(),
            description: description.trim() || null,
            durationLabel: durationLabel.trim() || null,
            published,
          }),
        })
      }
      toast.success(editing ? "Treinamento atualizado" : "Treinamento adicionado")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar treinamento" : "Novo treinamento"}</DialogTitle>
          <DialogDescription>
            Cole o link do vídeo do YouTube — aceitamos qualquer formato de URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="v-title">Título</Label>
            <Input
              id="v-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Como configurar sua vitrine"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-url">Link do YouTube</Label>
            <Input
              id="v-url"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-desc">Descrição (opcional)</Label>
            <Textarea
              id="v-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-dur">Duração (opcional)</Label>
            <Input
              id="v-dur"
              value={durationLabel}
              onChange={(e) => setDurationLabel(e.target.value)}
              placeholder="Ex: 08:42"
              className="max-w-[140px]"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Exibir para as unidades</p>
              <p className="text-xs text-gray-500">Desligue para manter como rascunho.</p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editing ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
