"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"
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
import type {
  ArtItem,
  ArtVariant,
  ArtVariantKind,
  TenantBrand,
  VariantLayout,
} from "@/lib/artes/types"
import {
  formatPriceBRL,
  resolveVariantLayout,
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
import { ArtLayoutEditor, type EditorState } from "@/components/shared/art-layout-editor"

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
  variant: ArtVariant,
  brand: TenantBrand,
  priceCents: number | null,
  layout: VariantLayout,
): Promise<{ blob: Blob; ext: string }> {
  const canvas = document.createElement("canvas")
  try {
    await composeArt(canvas, {
      artUrl: variant.url,
      artWidth: variant.width,
      artHeight: variant.height,
      tenant: brand,
      priceCents,
      layout,
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

export function ArteDownloadDialog({
  art,
  brand,
  onClose,
}: {
  art: ArtItem
  brand: TenantBrand
  onClose: () => void
}) {
  const [previewKind, setPreviewKind] = useState<ArtVariantKind>("feed")
  const [downloadBoth, setDownloadBoth] = useState(!!art.story)
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [editorState, setEditorState] = useState<EditorState>("loading")
  const [downloading, setDownloading] = useState(false)
  // Ajustes da revenda (posicao/tamanho/fundos) — vivem so nesta sessao do
  // dialog, inicializados do layout salvo pelo designer.
  const [layouts, setLayouts] = useState<Record<ArtVariantKind, VariantLayout>>(() => ({
    feed: resolveVariantLayout(art, "feed"),
    story: resolveVariantLayout(art, "story"),
  }))

  const previewVariant = previewKind === "story" && art.story ? art.story : art.feed
  const needsPrice = art.hasPrice && priceCents == null

  function variantFor(kind: ArtVariantKind): ArtVariant {
    return kind === "story" && art.story ? art.story : art.feed
  }

  async function handleDownload() {
    if (editorState !== "ready") return
    setDownloading(true)
    try {
      const kinds: ArtVariantKind[] =
        downloadBoth && art.story ? ["feed", "story"] : [previewKind]

      if (kinds.length === 1) {
        const kind = kinds[0]
        const { blob, ext } = await composeVariantBlob(
          variantFor(kind),
          brand,
          art.hasPrice ? priceCents : null,
          layouts[kind],
        )
        downloadBlob(blob, variantFilename(art, kind, brand.slug, ext))
      } else {
        const { default: JSZip } = await import("jszip")
        const zip = new JSZip()
        for (const kind of kinds) {
          const { blob, ext } = await composeVariantBlob(
            variantFor(kind),
            brand,
            art.hasPrice ? priceCents : null,
            layouts[kind],
          )
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
            Prévia já personalizada com os dados da sua unidade — ajuste posição, tamanho e
            fundos como preferir; o arquivo baixado é exatamente o que você vê.
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

          <ArtLayoutEditor
            artUrl={previewVariant.url}
            artWidth={previewVariant.width}
            artHeight={previewVariant.height}
            brand={brand}
            hasPrice={art.hasPrice}
            samplePriceCents={priceCents ?? 19990}
            value={layouts[previewKind]}
            onChange={(next) => setLayouts((prev) => ({ ...prev, [previewKind]: next }))}
            onStateChange={setEditorState}
          />

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
                  : "Digite o valor para liberar o download (a prévia mostra R$ 199,90 de exemplo)."}
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
            disabled={editorState !== "ready" || needsPrice || downloading}
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
