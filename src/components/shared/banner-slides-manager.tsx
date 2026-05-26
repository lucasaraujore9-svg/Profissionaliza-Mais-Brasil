"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import {
  Loader2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface BannerSlide {
  id: string
  order: number
  desktopUrl: string
  mobileUrl: string
  linkUrl: string | null
  active: boolean
}

interface BannerSlidesManagerProps {
  /** Ex: "/api/painel/banner" ou "/api/admin/banner" */
  apiBase: string
  title?: string
  description?: string
}

const SPEC = {
  desktop: { width: 1920, height: 600 },
  mobile: { width: 1080, height: 1080 },
  tolerancePx: 2,
} as const

type Slot = "desktop" | "mobile"

async function readImageDimsBrowser(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new globalThis.Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function checkClientDims(
  dims: { width: number; height: number } | null,
  slot: Slot,
): string | null {
  if (!dims) return "Não foi possível ler as dimensões da imagem."
  const target = SPEC[slot]
  const tol = SPEC.tolerancePx
  if (
    Math.abs(dims.width - target.width) > tol ||
    Math.abs(dims.height - target.height) > tol
  ) {
    return `Imagem ${slot} precisa ser ${target.width}×${target.height}px (±${tol}). Recebida ${dims.width}×${dims.height}px.`
  }
  return null
}

export function BannerSlidesManager({
  apiBase,
  title = "Banner principal",
  description,
}: BannerSlidesManagerProps) {
  const [slides, setSlides] = useState<BannerSlide[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftDesktop, setDraftDesktop] = useState<string | null>(null)
  const [draftMobile, setDraftMobile] = useState<string | null>(null)
  const [draftLink, setDraftLink] = useState("")
  const [uploadingSlot, setUploadingSlot] = useState<Slot | null>(null)
  const [creatingSlide, setCreatingSlide] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(apiBase, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) {
        setLoadError(body.error ?? "Erro ao carregar slides")
        return
      }
      setSlides(body.data as BannerSlide[])
    } catch {
      setLoadError("Erro de rede")
    }
  }, [apiBase])

  useEffect(() => {
    void load()
  }, [load])

  const uploadFile = async (slot: Slot, file: File) => {
    setErrorMsg(null)
    const dims = await readImageDimsBrowser(file)
    const dimError = checkClientDims(dims, slot)
    if (dimError) {
      setErrorMsg(dimError)
      return
    }
    setUploadingSlot(slot)
    try {
      const form = new FormData()
      form.set("slot", slot)
      form.set("file", file)
      const res = await fetch(`${apiBase}/upload`, {
        method: "POST",
        body: form,
      })
      const body = await res.json()
      if (!res.ok) {
        setErrorMsg(body.error ?? "Falha no upload")
        return
      }
      if (slot === "desktop") setDraftDesktop(body.data.url)
      else setDraftMobile(body.data.url)
    } catch {
      setErrorMsg("Erro de rede no upload")
    } finally {
      setUploadingSlot(null)
    }
  }

  const cancelCreate = () => {
    setCreating(false)
    setDraftDesktop(null)
    setDraftMobile(null)
    setDraftLink("")
    setErrorMsg(null)
  }

  const handleCreate = async () => {
    if (!draftDesktop || !draftMobile) {
      setErrorMsg("Envie a imagem desktop e a mobile antes de salvar.")
      return
    }
    setCreatingSlide(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desktopUrl: draftDesktop,
          mobileUrl: draftMobile,
          linkUrl: draftLink.trim() || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErrorMsg(body.error ?? "Erro ao salvar slide")
        return
      }
      cancelCreate()
      void load()
    } catch {
      setErrorMsg("Erro de rede")
    } finally {
      setCreatingSlide(false)
    }
  }

  const patchSlide = async (
    id: string,
    data: Partial<Pick<BannerSlide, "active" | "linkUrl" | "order">>,
  ) => {
    const res = await fetch(`${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      void load()
      return
    }
    void load()
  }

  const removeSlide = async (id: string) => {
    if (!confirm("Remover este slide do banner?")) return
    const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" })
    if (res.ok) void load()
  }

  const reorder = (id: string, dir: -1 | 1) => {
    if (!slides) return
    const idx = slides.findIndex((s) => s.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= slides.length) return
    const a = slides[idx]
    const b = slides[swap]
    // Otimismo: atualiza UI antes do servidor
    const next = [...slides]
    next[idx] = b
    next[swap] = a
    setSlides(next)
    void Promise.all([
      patchSlide(a.id, { order: b.order }),
      patchSlide(b.id, { order: a.order }),
    ])
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {description ??
              `Imagens da hero. Desktop ${SPEC.desktop.width}×${SPEC.desktop.height}px, mobile ${SPEC.mobile.width}×${SPEC.mobile.height}px.`}
          </p>
        </div>
        {!creating && (
          <Button
            type="button"
            size="sm"
            onClick={() => setCreating(true)}
            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            <Plus className="mr-1 h-4 w-4" />
            Adicionar slide
          </Button>
        )}
      </header>

      {loadError && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {loadError}
        </p>
      )}

      {errorMsg && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {errorMsg}
        </p>
      )}

      {creating && (
        <div className="mb-5 space-y-4 rounded-xl border border-dashed border-[var(--color-pmb-green)]/40 bg-[var(--color-pmb-lime-50)]/40 p-4">
          <h4 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Novo slide
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <SlotUploader
              slot="desktop"
              url={draftDesktop}
              uploading={uploadingSlot === "desktop"}
              onPick={(file) => void uploadFile("desktop", file)}
              onClear={() => setDraftDesktop(null)}
            />
            <SlotUploader
              slot="mobile"
              url={draftMobile}
              uploading={uploadingSlot === "mobile"}
              onPick={(file) => void uploadFile("mobile", file)}
              onClear={() => setDraftMobile(null)}
            />
          </div>

          <div>
            <Label htmlFor="banner-link" className="text-xs font-semibold text-gray-700">
              Link ao clicar (opcional)
            </Label>
            <Input
              id="banner-link"
              value={draftLink}
              onChange={(e) => setDraftLink(e.target.value)}
              placeholder="https://… (deixe vazio para não ter link)"
              className="mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" type="button" onClick={cancelCreate} disabled={creatingSlide}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!draftDesktop || !draftMobile || creatingSlide}
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              {creatingSlide ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar slide"
              )}
            </Button>
          </div>
        </div>
      )}

      {slides === null ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : slides.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          Nenhum slide ainda. Adicione um para substituir o banner padrão.
        </div>
      ) : (
        <ul className="space-y-3">
          {slides.map((s, i) => (
            <li
              key={s.id}
              className={`rounded-xl border bg-white p-3 ${
                s.active ? "border-gray-200" : "border-gray-200 opacity-60"
              }`}
            >
              <div className="grid grid-cols-[auto_1fr] items-start gap-3 md:grid-cols-[auto_1fr_auto]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative aspect-[16/5] w-40 overflow-hidden rounded-md bg-gray-100">
                    <Image
                      src={s.desktopUrl}
                      alt={`Desktop slide ${i + 1}`}
                      fill
                      sizes="160px"
                      unoptimized
                      className="object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      desktop
                    </span>
                  </div>
                  <div className="relative aspect-square w-20 overflow-hidden rounded-md bg-gray-100">
                    <Image
                      src={s.mobileUrl}
                      alt={`Mobile slide ${i + 1}`}
                      fill
                      sizes="80px"
                      unoptimized
                      className="object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      mobile
                    </span>
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-mono text-[var(--color-pmb-green-900)]">
                      #{i + 1}
                    </span>
                    <span>
                      {s.active ? "Visível" : "Oculto"}
                    </span>
                  </div>
                  <Input
                    value={s.linkUrl ?? ""}
                    placeholder="Link ao clicar (opcional)"
                    onChange={(e) => {
                      const value = e.target.value
                      setSlides((cur) =>
                        cur
                          ? cur.map((x) => (x.id === s.id ? { ...x, linkUrl: value || null } : x))
                          : cur,
                      )
                    }}
                    onBlur={(e) =>
                      void patchSlide(s.id, { linkUrl: e.target.value.trim() || null })
                    }
                    className="text-xs"
                  />
                </div>

                <div className="flex flex-col items-end gap-1 md:items-center md:gap-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => reorder(s.id, -1)}
                      disabled={i === 0}
                      title="Subir"
                      className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => reorder(s.id, 1)}
                      disabled={i === slides.length - 1}
                      title="Descer"
                      className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void patchSlide(s.id, { active: !s.active })}
                    title={s.active ? "Ocultar" : "Mostrar"}
                    className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50"
                  >
                    {s.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSlide(s.id)}
                    title="Remover"
                    className="rounded-md border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SlotUploader(props: {
  slot: Slot
  url: string | null
  uploading: boolean
  onPick: (file: File) => void
  onClear: () => void
}) {
  const spec = SPEC[props.slot]
  const ref = useRef<HTMLInputElement | null>(null)
  return (
    <div>
      <Label className="text-xs font-semibold text-gray-700">
        {props.slot === "desktop" ? "Imagem Desktop" : "Imagem Mobile"}{" "}
        <span className="font-normal text-gray-500">
          ({spec.width}×{spec.height}px)
        </span>
      </Label>
      <div className="mt-1.5">
        <label
          className={`relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-gray-50/60 transition-colors hover:border-[var(--color-pmb-cyan)] ${
            props.slot === "desktop" ? "aspect-[16/5]" : "aspect-square max-w-[180px]"
          } ${props.url ? "border-[var(--color-pmb-green)]/40" : "border-gray-300"}`}
        >
          {props.uploading ? (
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando…
            </span>
          ) : props.url ? (
            <>
              <Image
                src={props.url}
                alt=""
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                unoptimized
                className="object-cover"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  props.onClear()
                }}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white hover:bg-black/80"
              >
                Trocar
              </button>
            </>
          ) : (
            <span className="px-3 text-center text-[11px] text-gray-500">
              Clique para enviar
              <br />
              PNG, JPG ou WEBP · max 5MB
            </span>
          )}
          <input
            ref={ref}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) props.onPick(f)
              if (e.target) e.target.value = ""
            }}
          />
        </label>
      </div>
    </div>
  )
}
