"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Download, Loader2, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ArtItem, ArtVariant, ArtVariantKind, TenantBrand } from "@/lib/artes/types"
import {
  formatPriceBRL,
  slugifyFilename,
  VARIANT_FILE_SUFFIX,
  VARIANT_LABEL,
} from "@/lib/artes/types"
import {
  composeArt,
  canvasToBlob,
  downloadBlob,
  isCanvasSecurityError,
  outputFormatFor,
} from "@/lib/artes/compose"

// Input de valor em reais: guarda centavos e exibe "199,90" enquanto digita.
export function PriceInput({
  id,
  priceCents,
  onChange,
  disabled,
}: {
  id: string
  priceCents: number | null
  onChange: (cents: number | null) => void
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
        R$
      </span>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="0,00"
        className="pl-9"
        disabled={disabled}
        value={
          priceCents == null
            ? ""
            : (priceCents / 100).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
        }
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "")
          if (!digits) {
            onChange(null)
            return
          }
          onChange(Math.min(parseInt(digits, 10), 99999999))
        }}
      />
    </div>
  )
}

// Compoe uma variante num canvas descartavel e devolve o blob final.
export async function composeVariantBlob(
  art: ArtItem,
  variant: ArtVariant,
  brand: TenantBrand,
  priceCents: number | null,
): Promise<{ blob: Blob; ext: string }> {
  const canvas = document.createElement("canvas")
  try {
    await composeArt(canvas, {
      artUrl: variant.url,
      artWidth: variant.width,
      artHeight: variant.height,
      logoCorner: art.logoCorner,
      tenant: brand,
      priceCents: art.hasPrice ? priceCents : null,
    })
    const format = outputFormatFor(variant.url)
    const blob = await canvasToBlob(canvas, format.mime, format.quality)
    return { blob, ext: format.ext }
  } finally {
    // Libera o buffer do canvas descartavel.
    canvas.width = 0
    canvas.height = 0
  }
}

export function variantFilename(
  art: ArtItem,
  kind: ArtVariantKind,
  tenantSlug: string,
  ext: string,
): string {
  return `${slugifyFilename(art.title)}-${tenantSlug}-${VARIANT_FILE_SUFFIX[kind]}.${ext}`
}

type ComposeState = "loading" | "ready" | "error"

export function ArteDownloadDialog({
  art,
  brand,
  onClose,
}: {
  art: ArtItem
  brand: TenantBrand
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewKind, setPreviewKind] = useState<ArtVariantKind>("feed")
  const [downloadBoth, setDownloadBoth] = useState(!!art.story)
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [state, setState] = useState<ComposeState>("loading")
  const [downloading, setDownloading] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const previewVariant = previewKind === "story" && art.story ? art.story : art.feed

  // Recompoe o preview quando abre/retry, troca de versao ou muda o preco.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setState("loading")
    const timer = setTimeout(async () => {
      try {
        await composeArt(canvas, {
          artUrl: previewVariant.url,
          artWidth: previewVariant.width,
          artHeight: previewVariant.height,
          logoCorner: art.logoCorner,
          tenant: brand,
          priceCents: art.hasPrice ? priceCents : null,
        })
        if (!cancelled) setState("ready")
      } catch (err) {
        console.error("[artes] falha ao compor preview:", err)
        if (!cancelled) setState("error")
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [art, brand, priceCents, previewVariant, retryKey])

  const needsPrice = art.hasPrice && priceCents == null

  async function handleDownload() {
    if (state !== "ready") return
    setDownloading(true)
    try {
      const kinds: ArtVariantKind[] =
        downloadBoth && art.story ? ["feed", "story"] : [previewKind]

      if (kinds.length === 1) {
        const kind = kinds[0]
        const variant = kind === "story" && art.story ? art.story : art.feed
        const { blob, ext } = await composeVariantBlob(art, variant, brand, priceCents)
        downloadBlob(blob, variantFilename(art, kind, brand.slug, ext))
      } else {
        const { default: JSZip } = await import("jszip")
        const zip = new JSZip()
        for (const kind of kinds) {
          const variant = kind === "story" && art.story ? art.story : art.feed
          const { blob, ext } = await composeVariantBlob(art, variant, brand, priceCents)
          zip.file(variantFilename(art, kind, brand.slug, ext), blob)
        }
        const zipBlob = await zip.generateAsync({ type: "blob" })
        downloadBlob(zipBlob, `${slugifyFilename(art.title)}-${brand.slug}.zip`)
      }
      toast.success(kinds.length === 2 ? "Feed + stories baixados (.zip)" : "Arte baixada")
    } catch (err) {
      if (isCanvasSecurityError(err)) {
        toast.error(
          "Não foi possível gerar a arte neste navegador (bloqueio de segurança de imagem). Recarregue a página e tente novamente.",
        )
      } else {
        toast.error("Falha ao gerar o arquivo. Tente novamente.")
      }
      console.error("[artes] falha no download:", err)
    } finally {
      setDownloading(false)
    }
  }

  const downloadLabel =
    downloadBoth && art.story ? "Baixar as 2 (.zip)" : `Baixar ${VARIANT_LABEL[previewKind]}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{art.title}</DialogTitle>
          <DialogDescription>
            Prévia já personalizada com os dados da sua unidade — o arquivo baixado é
            exatamente o que você vê.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {art.story && (
            <div className="flex items-center gap-2">
              {(["feed", "story"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPreviewKind(kind)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    previewKind === kind
                      ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green)]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300",
                  )}
                >
                  {VARIANT_LABEL[kind]}
                </button>
              ))}
            </div>
          )}

          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {/* O canvas fica no tamanho REAL da arte; o CSS escala o preview.
                Stories (9:16) fica estreito para caber no dialog sem rolagem. */}
            <canvas
              ref={canvasRef}
              className={cn(
                "block h-auto w-full",
                previewKind === "story" && art.story && "mx-auto max-w-[280px]",
              )}
            />
            {state === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}
            {state === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 px-6 text-center">
                <p className="text-sm text-gray-700">
                  Não foi possível montar a prévia. Verifique sua conexão e tente de novo.
                </p>
                <Button variant="outline" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Tentar novamente
                </Button>
              </div>
            )}
          </div>

          {art.story && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5">
              <input
                type="checkbox"
                checked={downloadBoth}
                onChange={(e) => setDownloadBoth(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-pmb-green)]"
              />
              <span className="text-sm text-gray-800">
                Baixar as duas versões (feed + stories) num .zip
              </span>
            </label>
          )}

          {art.hasPrice && (
            <div className="space-y-1.5">
              <Label htmlFor="arte-preco">Valor exibido na arte</Label>
              <PriceInput id="arte-preco" priceCents={priceCents} onChange={setPriceCents} />
              <p className="text-xs text-gray-500">
                {priceCents != null
                  ? `Será carimbado como ${formatPriceBRL(priceCents)}.`
                  : "Digite o valor para liberar o download."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={handleDownload}
            disabled={state !== "ready" || needsPrice || downloading}
          >
            {downloading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            {downloadLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
