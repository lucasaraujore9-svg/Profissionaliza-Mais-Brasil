"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
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
  Move,
  ArrowLeft,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArtLayoutEditor, sampleBrand } from "@/components/shared/art-layout-editor"
import {
  defaultVariantLayout,
  VARIANT_LABEL,
  type ArtLayout,
  type ArtVariantKind,
  type LogoCorner,
} from "@/lib/artes/types"

interface MarketingArt {
  id: string
  title: string
  category: string | null
  filePath: string
  publicUrl: string
  width: number
  height: number
  storyFilePath: string | null
  storyPublicUrl: string | null
  storyWidth: number | null
  storyHeight: number | null
  hasPrice: boolean
  logoCorner: "top-left" | "top-right"
  layout: ArtLayout | null
  published: boolean
  position: number
}

// Mede um arquivo local (antes do upload) e devolve objectURL + dimensoes
// para o editor de posicoes.
async function measureLocalFile(
  file: File,
): Promise<{ url: string; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    // window.Image: o import de next/image sombreia o construtor global aqui.
    const img = new window.Image()
    img.onload = () =>
      resolve({ url, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Não foi possível ler ${file.name}`))
    }
    img.src = url
  })
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

const UPLOAD_ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"])
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024

// Envia o arquivo DIRETO ao Supabase Storage via URL assinada (o body das
// functions da Vercel e limitado a 4.5MB — o arquivo nao pode passar pela
// nossa API). Devolve o path gravado, que a rota de create/file valida.
async function uploadToStorage(file: File, kind: "feed" | "story"): Promise<string> {
  const label = kind === "feed" ? "feed" : "stories"
  if (!UPLOAD_ALLOWED.has(file.type)) {
    throw new Error(`Arquivo de ${label}: use PNG, JPG ou WEBP`)
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error(`Arquivo de ${label} maior que 10MB`)
  }
  const signed = await api("/api/admin/artes/upload-url", {
    method: "POST",
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  })
  const { path, uploadUrl } = signed.data as { path: string; uploadUrl: string }
  // Sem x-upsert: o token assinado ja define a politica e os paths sao UUIDs
  // unicos (nunca colidem).
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  })
  if (!put.ok) {
    throw new Error(`Falha ao enviar o arquivo de ${label} para o storage`)
  }
  return path
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
  const [positioning, setPositioning] = useState<MarketingArt | null>(null)
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
                <Badge
                  variant="outline"
                  className={art.storyFilePath ? "text-violet-700" : "text-gray-500"}
                >
                  {art.storyFilePath ? "Feed + Stories" : "Só feed"}
                </Badge>
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
                    onClick={() => setPositioning(art)}
                    title="Posições (logo/preço)"
                  >
                    <Move className="h-4 w-4" />
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

      {positioning && (
        <LayoutDialog
          art={positioning}
          onClose={() => setPositioning(null)}
          onSaved={() => {
            setPositioning(null)
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
  const [step, setStep] = useState<1 | 2>(1)
  const [feedFile, setFeedFile] = useState<File | null>(null)
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [feedPreview, setFeedPreview] = useState<{ url: string; width: number; height: number } | null>(null)
  const [storyPreview, setStoryPreview] = useState<{ url: string; width: number; height: number } | null>(null)
  const [layout, setLayout] = useState<ArtLayout | null>(null)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [hasPrice, setHasPrice] = useState(false)
  const [logoCorner, setLogoCorner] = useState<"top-left" | "top-right">("top-right")
  const [sending, setSending] = useState(false)

  // objectURLs vivem ate o fechamento do dialog.
  useEffect(() => {
    return () => {
      if (feedPreview) URL.revokeObjectURL(feedPreview.url)
      if (storyPreview) URL.revokeObjectURL(storyPreview.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function goToPositions() {
    if (!feedFile) {
      toast.error("Selecione o arquivo da versão de feed")
      return
    }
    try {
      // Previews locais (antes do upload) para o editor de posicoes.
      const feed = feedPreview ?? (await measureLocalFile(feedFile))
      setFeedPreview(feed)
      let story = storyPreview
      if (storyFile && !story) {
        story = await measureLocalFile(storyFile)
        setStoryPreview(story)
      }
      setLayout(
        (prev) =>
          prev ?? {
            feed: defaultVariantLayout("feed", logoCorner, hasPrice),
            ...(storyFile
              ? { story: defaultVariantLayout("story", logoCorner, hasPrice) }
              : {}),
          },
      )
      setStep(2)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler os arquivos")
    }
  }

  async function send() {
    if (!feedFile || !layout) return
    const finalTitle =
      title.trim() || feedFile.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Arte"
    setSending(true)
    try {
      // Upload direto ao Storage (signed URL) e depois o registro via JSON.
      const feedPath = await uploadToStorage(feedFile, "feed")
      const storyPath = storyFile ? await uploadToStorage(storyFile, "story") : null
      await api("/api/admin/artes", {
        method: "POST",
        body: JSON.stringify({
          title: finalTitle,
          category: category.trim() || null,
          hasPrice,
          logoCorner,
          feedPath,
          storyPath,
          layout,
        }),
      })
      toast.success("Arte enviada")
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload", { duration: 8000 })
    } finally {
      setSending(false)
    }
  }

  if (step === 2 && layout && feedPreview) {
    return (
      <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Posições — logo{hasPrice ? " e preço" : ""}</DialogTitle>
            <DialogDescription>
              Defina os padrões desta arte com a marca de exemplo. A unidade ainda pode
              ajustar tudo na hora de baixar.
            </DialogDescription>
          </DialogHeader>
          {storyPreview ? (
            <Tabs defaultValue="feed">
              <TabsList>
                <TabsTrigger value="feed">{VARIANT_LABEL.feed}</TabsTrigger>
                <TabsTrigger value="story">{VARIANT_LABEL.story}</TabsTrigger>
              </TabsList>
              {(["feed", "story"] as const).map((kind) => {
                const preview = kind === "feed" ? feedPreview : storyPreview
                const variantLayout = layout[kind]
                if (!preview || !variantLayout) return null
                return (
                  <TabsContent key={kind} value={kind}>
                    <ArtLayoutEditor
                      artUrl={preview.url}
                      artWidth={preview.width}
                      artHeight={preview.height}
                      brand={sampleBrand()}
                      hasPrice={hasPrice}
                      value={variantLayout}
                      onChange={(next) => setLayout((prev) => (prev ? { ...prev, [kind]: next } : prev))}
                    />
                  </TabsContent>
                )
              })}
            </Tabs>
          ) : (
            <ArtLayoutEditor
              artUrl={feedPreview.url}
              artWidth={feedPreview.width}
              artHeight={feedPreview.height}
              brand={sampleBrand()}
              hasPrice={hasPrice}
              value={layout.feed}
              onChange={(next) => setLayout((prev) => (prev ? { ...prev, feed: next } : prev))}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(1)} disabled={sending}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
            </Button>
            <Button onClick={send} disabled={sending}>
              {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova arte</DialogTitle>
          <DialogDescription>
            Cada arte tem a versão de FEED (quadrada ou 4:5) e a de STORIES (9:16, ex.
            1080x1920px). PNG, JPG ou WEBP até 10MB, mínimo 600px, máximo 4096px de lado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-feed">Arquivo — Feed</Label>
            <Input
              id="a-feed"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={sending}
              onChange={(e) => {
                setFeedFile(e.target.files?.[0] ?? null)
                // Arquivo trocado: preview e layout do passo 2 sao re-derivados.
                if (feedPreview) URL.revokeObjectURL(feedPreview.url)
                setFeedPreview(null)
                setLayout(null)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-story">Arquivo — Stories (opcional)</Label>
            <Input
              id="a-story"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={sending}
              onChange={(e) => {
                setStoryFile(e.target.files?.[0] ?? null)
                if (storyPreview) URL.revokeObjectURL(storyPreview.url)
                setStoryPreview(null)
                setLayout(null)
              }}
            />
            <p className="text-xs text-gray-500">
              Sem o arquivo de stories, a unidade só verá a versão de feed. Dá para anexar
              depois pela edição.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Título (opcional — usa o nome do arquivo)</Label>
            <Input
              id="a-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={sending}
            />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={goToPositions} disabled={sending || !feedFile}>
            Continuar → posições
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------- Layout dialog ----------------------------- */

// Edita as POSICOES salvas de uma arte existente (arquivos ja no storage).
function LayoutDialog({
  art,
  onClose,
  onSaved,
}: {
  art: MarketingArt
  onClose: () => void
  onSaved: () => void
}) {
  const [layout, setLayout] = useState<ArtLayout>(() => ({
    feed:
      art.layout?.feed ??
      defaultVariantLayout("feed", art.logoCorner as LogoCorner, art.hasPrice),
    ...(art.storyFilePath
      ? {
          story:
            art.layout?.story ??
            defaultVariantLayout("story", art.logoCorner as LogoCorner, art.hasPrice),
        }
      : {}),
  }))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api(`/api/admin/artes/${art.id}`, {
        method: "PATCH",
        body: JSON.stringify({ layout }),
      })
      toast.success("Posições salvas")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const editorFor = (kind: ArtVariantKind) => {
    const variantLayout = layout[kind]
    if (!variantLayout) return null
    const url = kind === "feed" ? art.publicUrl : art.storyPublicUrl
    const width = kind === "feed" ? art.width : art.storyWidth
    const height = kind === "feed" ? art.height : art.storyHeight
    if (!url || !width || !height) return null
    return (
      <ArtLayoutEditor
        artUrl={url}
        artWidth={width}
        artHeight={height}
        brand={sampleBrand()}
        hasPrice={art.hasPrice}
        value={variantLayout}
        onChange={(next) => setLayout((prev) => ({ ...prev, [kind]: next }))}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Posições — {art.title}</DialogTitle>
          <DialogDescription>
            Padrões desta arte com a marca de exemplo. A unidade ainda pode ajustar tudo na
            hora de baixar.
          </DialogDescription>
        </DialogHeader>
        {art.storyFilePath ? (
          <Tabs defaultValue="feed">
            <TabsList>
              <TabsTrigger value="feed">{VARIANT_LABEL.feed}</TabsTrigger>
              <TabsTrigger value="story">{VARIANT_LABEL.story}</TabsTrigger>
            </TabsList>
            <TabsContent value="feed">{editorFor("feed")}</TabsContent>
            <TabsContent value="story">{editorFor("story")}</TabsContent>
          </Tabs>
        ) : (
          editorFor("feed")
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar posições
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
  const [feedFile, setFeedFile] = useState<File | null>(null)
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  async function replaceVariant(kind: "feed" | "story", file: File) {
    const path = await uploadToStorage(file, kind)
    await api(`/api/admin/artes/${art.id}/file`, {
      method: "POST",
      body: JSON.stringify({ kind, path }),
    })
  }

  async function save() {
    if (title.trim().length < 1) {
      toast.error("Informe um título")
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
      if (feedFile) await replaceVariant("feed", feedFile)
      if (storyFile) await replaceVariant("story", storyFile)
      toast.success("Arte atualizada")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar", { duration: 8000 })
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
            Edite os dados ou troque os arquivos das versões de feed e stories.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-title">Título</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-feed">Trocar arquivo do feed (opcional)</Label>
            <Input
              id="e-feed"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={saving}
              onChange={(e) => setFeedFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-story">
              {art.storyFilePath ? "Trocar arquivo de stories (opcional)" : "Adicionar versão de stories"}
            </Label>
            <Input
              id="e-story"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={saving}
              onChange={(e) => setStoryFile(e.target.files?.[0] ?? null)}
            />
            {!art.storyFilePath && (
              <p className="text-xs text-gray-500">
                Esta arte ainda não tem a versão de stories (9:16).
              </p>
            )}
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
