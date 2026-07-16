"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Images as ImagesIcon,
  Loader2,
  Tag,
  BadgeDollarSign,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

interface MarketingArt {
  id: string
  title: string
  category: string | null
  filePath: string
  publicUrl: string
  width: number
  height: number
  hasPrice: boolean
  logoCorner: "top-left" | "top-right"
  published: boolean
  position: number
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

const CORNER_LABEL: Record<MarketingArt["logoCorner"], string> = {
  "top-left": "Logo no topo esquerdo",
  "top-right": "Logo no topo direito",
}

export function ArtesAdminClient() {
  const [arts, setArts] = useState<MarketingArt[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editing, setEditing] = useState<MarketingArt | null>(null)
  const [confirm, setConfirm] = useState<MarketingArt | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await api("/api/admin/artes")
      setArts(json.data.arts)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const categories = useMemo(
    () =>
      Array.from(
        new Set(arts.map((a) => a.category).filter((c): c is string => !!c)),
      ).sort(),
    [arts],
  )

  async function togglePublished(art: MarketingArt) {
    setBusyId(art.id)
    try {
      await api(`/api/admin/artes/${art.id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: !art.published }),
      })
      toast.success(art.published ? "Arte despublicada" : "Arte publicada")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha")
    } finally {
      setBusyId(null)
    }
  }

  async function reorder(ids: string[]) {
    try {
      await api("/api/admin/artes/reorder", {
        method: "POST",
        body: JSON.stringify({ orderedIds: ids }),
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reordenar")
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...arts]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setArts(next)
    void reorder(next.map((a) => a.id))
  }

  async function doDelete() {
    if (!confirm) return
    setBusyId(confirm.id)
    try {
      await api(`/api/admin/artes/${confirm.id}`, { method: "DELETE" })
      toast.success("Arte removida")
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
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando artes…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {arts.length} arte{arts.length === 1 ? "" : "s"}
          {categories.length > 0 && ` · ${categories.length} categoria(s)`}
        </p>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Enviar artes
        </Button>
      </div>

      {arts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <ImagesIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium text-gray-700">Nenhuma arte ainda</p>
          <p className="mt-1 text-sm text-gray-500">
            Envie as artes cruas (sem logo, telefone ou valor) — pode selecionar vários arquivos de uma vez.
          </p>
          <Button className="mt-4" onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Enviar artes
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {arts.map((art, i) => (
          <div
            key={art.id}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="relative aspect-square bg-gray-100">
              <Image
                src={art.publicUrl}
                alt={art.title}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-contain"
                unoptimized
              />
              {!art.published && (
                <Badge variant="secondary" className="absolute left-2 top-2">
                  Rascunho
                </Badge>
              )}
            </div>
            <div className="space-y-2 p-3">
              <p className="truncate text-sm font-semibold text-gray-900" title={art.title}>
                {art.title}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {art.category && (
                  <Badge variant="outline" className="gap-1">
                    <Tag className="h-3 w-3" /> {art.category}
                  </Badge>
                )}
                {art.hasPrice && (
                  <Badge variant="outline" className="gap-1 text-emerald-700">
                    <BadgeDollarSign className="h-3 w-3" /> Com valor
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {art.width}x{art.height}px · {CORNER_LABEL[art.logoCorner]}
              </p>
              <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === arts.length - 1}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === art.id}
                    onClick={() => togglePublished(art)}
                    title={art.published ? "Despublicar" : "Publicar"}
                  >
                    {art.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(art)}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirm(art)}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {uploadOpen && (
        <UploadDialog
          categories={categories}
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false)
            void load()
          }}
        />
      )}

      {editing && (
        <EditDialog
          art={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arte?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{confirm?.title}&quot; será removida do banco de artes e o arquivo será
              apagado do storage. Esta ação não pode ser desfeita.
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

/* ----------------------------- Upload dialog ----------------------------- */

function UploadDialog({
  categories,
  onClose,
  onDone,
}: {
  categories: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState("")
  const [hasPrice, setHasPrice] = useState(false)
  const [logoCorner, setLogoCorner] = useState<"top-left" | "top-right">("top-right")
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function send() {
    if (files.length === 0) {
      toast.error("Selecione ao menos um arquivo")
      return
    }
    setSending(true)
    setProgress(0)
    // POSTs SEQUENCIAIS (1 por arquivo): erro num arquivo nao aborta o lote —
    // coletamos as falhas e reportamos no final.
    const failures: string[] = []
    let sent = 0
    for (const file of files) {
      const form = new FormData()
      form.set("file", file)
      form.set("title", file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Arte")
      if (category.trim()) form.set("category", category.trim())
      form.set("hasPrice", String(hasPrice))
      form.set("logoCorner", logoCorner)
      try {
        const res = await fetch("/api/admin/artes", { method: "POST", body: form })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? "Erro no upload")
        sent += 1
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error ? e.message : "erro"}`)
      }
      setProgress(sent + failures.length)
    }
    setSending(false)
    if (failures.length > 0) {
      toast.error(
        `${failures.length} arquivo(s) falharam:\n${failures.slice(0, 3).join("\n")}${failures.length > 3 ? "\n…" : ""}`,
        { duration: 10000 },
      )
    }
    if (sent > 0) {
      toast.success(`${sent} arte(s) enviada(s)`)
      onDone()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar artes</DialogTitle>
          <DialogDescription>
            PNG, JPG ou WEBP até 10MB, mínimo 600x600px e máximo 4096px de lado. Categoria e
            opções abaixo aplicam-se a todos os arquivos do lote.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-files">Arquivos</Label>
            <Input
              id="a-files"
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={sending}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-gray-500">{files.length} arquivo(s) selecionado(s)</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-cat">Categoria (opcional)</Label>
            <Input
              id="a-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Cursos, Datas comemorativas…"
              list="artes-categorias"
              maxLength={60}
              disabled={sending}
            />
            <datalist id="artes-categorias">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Posição do logo da unidade</Label>
            <Select
              value={logoCorner}
              onValueChange={(v) => setLogoCorner(v as "top-left" | "top-right")}
              disabled={sending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-right">Topo direito</SelectItem>
                <SelectItem value="top-left">Topo esquerdo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Arte com valor</p>
              <p className="text-xs text-gray-500">
                A unidade digita o preço na hora de baixar (carimbado na arte).
              </p>
            </div>
            <Switch checked={hasPrice} onCheckedChange={setHasPrice} disabled={sending} />
          </div>
          {sending && (
            <p className="text-sm text-gray-600">
              Enviando… {progress}/{files.length}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={sending || files.length === 0}>
            {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enviar {files.length > 0 ? `(${files.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ Edit dialog ------------------------------ */

function EditDialog({
  art,
  categories,
  onClose,
  onSaved,
}: {
  art: MarketingArt
  categories: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(art.title)
  const [category, setCategory] = useState(art.category ?? "")
  const [hasPrice, setHasPrice] = useState(art.hasPrice)
  const [logoCorner, setLogoCorner] = useState<"top-left" | "top-right">(art.logoCorner)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (title.trim().length < 2) {
      toast.error("Informe um título com ao menos 2 caracteres")
      return
    }
    setSaving(true)
    try {
      await api(`/api/admin/artes/${art.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim() || null,
          hasPrice,
          logoCorner,
        }),
      })
      toast.success("Arte atualizada")
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
          <DialogTitle>Editar arte</DialogTitle>
          <DialogDescription>
            Para trocar a imagem, exclua esta arte e envie o novo arquivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-title">Título</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-cat">Categoria (opcional)</Label>
            <Input
              id="e-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="artes-categorias-edit"
              maxLength={60}
            />
            <datalist id="artes-categorias-edit">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Posição do logo da unidade</Label>
            <Select
              value={logoCorner}
              onValueChange={(v) => setLogoCorner(v as "top-left" | "top-right")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-right">Topo direito</SelectItem>
                <SelectItem value="top-left">Topo esquerdo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Arte com valor</p>
              <p className="text-xs text-gray-500">
                A unidade digita o preço na hora de baixar (carimbado na arte).
              </p>
            </div>
            <Switch checked={hasPrice} onCheckedChange={setHasPrice} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
