"use client"

import Image from "next/image"
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
import { Label } from "@/components/ui/label"
import type { ArtItem, TenantBrand } from "@/lib/artes/types"
import { downloadBlob, isCanvasSecurityError } from "@/lib/artes/compose"
import { PriceInput, composeVariantBlob, variantFilename } from "./arte-download-dialog"

export function BatchDownloadDialog({
  arts,
  brand,
  onClose,
}: {
  arts: ArtItem[]
  brand: TenantBrand
  onClose: () => void
}) {
  const [prices, setPrices] = useState<Record<string, number | null>>({})
  const [includeFeed, setIncludeFeed] = useState(true)
  const [includeStory, setIncludeStory] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)

  const priced = arts.filter((a) => a.hasPrice)
  const missingPrice = priced.some((a) => prices[a.id] == null)
  const anyStory = arts.some((a) => a.story)
  const nothingSelected = !includeFeed && !includeStory
  // Só stories marcado: artes sem a versão de stories ficariam de fora.
  const skippedByStoryOnly = !includeFeed && includeStory ? arts.filter((a) => !a.story) : []
  const totalFiles =
    (includeFeed ? arts.length : 0) + (includeStory ? arts.filter((a) => a.story).length : 0)

  async function generate() {
    setGenerating(true)
    setProgress(0)
    try {
      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const usedNames = new Set<string>()
      let done = 0
      // Uma variante por vez (nunca em paralelo): teto de memoria = 1 canvas.
      for (const art of arts) {
        const price = art.hasPrice ? (prices[art.id] ?? null) : null
        const jobs: Array<"feed" | "story"> = []
        if (includeFeed) jobs.push("feed")
        if (includeStory && art.story) jobs.push("story")
        for (const kind of jobs) {
          const variant = kind === "story" && art.story ? art.story : art.feed
          const { blob, ext } = await composeVariantBlob(art, variant, brand, price)
          let name = variantFilename(art, kind, brand.slug, ext)
          // Titulos repetidos no lote nao podem sobrescrever entradas do zip.
          if (usedNames.has(name)) {
            name = name.replace(`.${ext}`, `-${done + 1}.${ext}`)
          }
          usedNames.add(name)
          zip.file(name, blob)
          done += 1
          setProgress(done)
        }
      }
      if (done === 0) {
        toast.error("Nenhum arquivo para gerar com as versões selecionadas.")
        return
      }
      const zipBlob = await zip.generateAsync({ type: "blob" })
      downloadBlob(zipBlob, `artes-${brand.slug}.zip`)
      toast.success(`${done} arquivo(s) no .zip`)
      onClose()
    } catch (err) {
      if (isCanvasSecurityError(err)) {
        toast.error(
          "Não foi possível gerar as artes neste navegador (bloqueio de segurança de imagem). Recarregue a página e tente novamente.",
        )
      } else {
        toast.error("Falha ao gerar o .zip. Tente novamente.")
      }
      console.error("[artes] falha no lote:", err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !generating && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Baixar {arts.length} arte(s)</DialogTitle>
          <DialogDescription>
            Todas serão personalizadas com os dados da sua unidade e entregues num único
            arquivo .zip.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-4 rounded-lg border border-gray-200 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-900">Versões:</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={includeFeed}
                onChange={(e) => setIncludeFeed(e.target.checked)}
                disabled={generating}
                className="h-4 w-4 accent-[var(--color-pmb-green)]"
              />
              Feed
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={includeStory}
                onChange={(e) => setIncludeStory(e.target.checked)}
                disabled={generating || !anyStory}
                className="h-4 w-4 accent-[var(--color-pmb-green)]"
              />
              Stories{!anyStory ? " (nenhuma selecionada tem)" : ""}
            </label>
          </div>

          {arts.map((art) => (
            <div
              key={art.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                <Image
                  src={art.feed.url}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {art.title}
                  {!art.story && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">(só feed)</span>
                  )}
                </p>
                {art.hasPrice && (
                  <div className="mt-1 max-w-[180px]">
                    <Label htmlFor={`preco-${art.id}`} className="sr-only">
                      Valor de {art.title}
                    </Label>
                    <PriceInput
                      id={`preco-${art.id}`}
                      priceCents={prices[art.id] ?? null}
                      onChange={(cents) => setPrices((p) => ({ ...p, [art.id]: cents }))}
                      disabled={generating}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {missingPrice && (
            <p className="text-xs text-amber-600">
              Digite o valor das artes marcadas para liberar o download.
            </p>
          )}
          {skippedByStoryOnly.length > 0 && (
            <p className="text-xs text-amber-600">
              {skippedByStoryOnly.length} arte(s) não têm versão de stories e ficarão de fora.
            </p>
          )}
          {generating && (
            <p className="text-sm text-gray-600">
              Gerando… {progress}/{totalFiles}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button
            onClick={generate}
            disabled={generating || missingPrice || nothingSelected || totalFiles === 0}
          >
            {generating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Gerar .zip {totalFiles > 0 ? `(${totalFiles})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
