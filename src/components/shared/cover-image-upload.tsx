"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

/**
 * Upload de capa (cover image) reutilizavel. Sobe o arquivo para o endpoint
 * informado (que persiste no Supabase Storage e devolve a URL publica) e
 * propaga a URL via `onChange`. Usado na criacao/edicao de pacotes (admin e
 * painel). Funciona tambem ANTES da entidade existir: o upload e standalone e
 * a URL resultante e salva junto no submit do form.
 *
 * Passa a URL atual como `previousUrl` para o endpoint limpar o asset anterior
 * quando o usuario troca a capa na mesma sessao de edicao.
 */
/** Le largura/altura do arquivo no browser (sem subir nada ainda). */
function readClientDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

export function CoverImageUpload({
  value,
  onChange,
  endpoint,
  disabled,
  aspectRatio,
  aspectLabel,
  minWidth,
  aspectTolerance = 0.04,
  hint,
}: {
  value: string | null
  onChange: (url: string | null) => void
  endpoint: string
  disabled?: boolean
  /** Quando definido, exige esta proporcao (ex.: 16/9) na imagem. */
  aspectRatio?: number
  /** Rotulo da proporcao para mensagens (ex.: "16:9"). */
  aspectLabel?: string
  /** Largura minima em px. */
  minWidth?: number
  /** Tolerancia relativa no aspect ratio (default 4%). */
  aspectTolerance?: number
  /** Texto auxiliar exibido na caixa de upload. */
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Formato não suportado (use PNG, JPG ou WEBP).")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 5MB.")
      return
    }
    if (aspectRatio) {
      const dims = await readClientDimensions(file)
      if (!dims) {
        toast.error("Não foi possível ler a imagem.")
        return
      }
      if (minWidth && dims.width < minWidth) {
        toast.error(
          `Imagem muito pequena. Use no mínimo ${minWidth}px de largura.`,
        )
        return
      }
      const ratio = dims.width / dims.height
      if (Math.abs(ratio - aspectRatio) / aspectRatio > aspectTolerance) {
        toast.error(
          `A capa precisa ter proporção ${aspectLabel ?? `${aspectRatio.toFixed(2)}:1`}. Recebida ${dims.width}x${dims.height}px.`,
        )
        return
      }
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.set("file", file)
      if (value) form.set("previousUrl", value)
      const res = await fetch(endpoint, { method: "POST", body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "Falha ao enviar capa")
      onChange(json.data.url as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload da capa")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          if (e.target) e.target.value = ""
        }}
      />

      {value ? (
        <div
          className="relative overflow-hidden rounded-lg border border-gray-200"
          style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Capa do pacote"
            className={aspectRatio ? "h-full w-full object-cover" : "h-32 w-full object-cover"}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || uploading}
            aria-label="Remover capa"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80 disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2"
          >
            {uploading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Trocar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-muted-foreground transition hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60${aspectRatio ? "" : " h-32"}`}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          {uploading ? "Enviando…" : "Subir capa"}
          <span className="text-[11px] text-gray-400">
            {hint ?? "PNG, JPG ou WEBP — até 5MB"}
          </span>
        </button>
      )}
    </div>
  )
}
