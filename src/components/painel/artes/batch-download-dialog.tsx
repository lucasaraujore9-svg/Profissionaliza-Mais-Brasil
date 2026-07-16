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
import { slugifyFilename } from "@/lib/artes/types"
import {
  composeArt,
  canvasToBlob,
  downloadBlob,
  isCanvasSecurityError,
  outputFormatFor,
} from "@/lib/artes/compose"
import { PriceInput } from "./arte-download-dialog"

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
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)

  const priced = arts.filter((a) => a.hasPrice)
  const missingPrice = priced.some((a) => prices[a.id] == null)

  async function generate() {
    setGenerating(true)
    setProgress(0)
    // Uma arte por vez (nunca em paralelo): teto de memoria = 1 canvas.
    const canvas = document.createElement("canvas")
    try {
      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const usedNames = new Set<string>()
      let done = 0
      for (const art of arts) {
        await composeArt(canvas, {
          artUrl: art.url,
          artWidth: art.width,
          artHeight: art.height,
          logoCorner: art.logoCorner,
          tenant: brand,
          priceCents: art.hasPrice ? (prices[art.id] ?? null) : null,
        })
        const format = outputFormatFor(art.url)
        const blob = await canvasToBlob(canvas, format.mime, format.quality)
        let name = `${slugifyFilename(art.title)}-${brand.slug}.${format.ext}`
        // Titulos repetidos no lote nao podem sobrescrever entradas do zip.
        if (usedNames.has(name)) {
          name = `${slugifyFilename(art.title)}-${brand.slug}-${done + 1}.${format.ext}`
        }
        usedNames.add(name)
        zip.file(name, blob)
        done += 1
        setProgress(done)
      }
      const zipBlob = await zip.generateAsync({ type: "blob" })
      downloadBlob(zipBlob, `artes-${brand.slug}.zip`)
      toast.success(`${done} arte(s) no arquivo .zip`)
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
      // Libera o buffer do canvas entre usos.
      canvas.width = 0
      canvas.height = 0
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
          {arts.map((art) => (
            <div
              key={art.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                <Image
                  src={art.url}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{art.title}</p>
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
          {generating && (
            <p className="text-sm text-gray-600">
              Gerando… {progress}/{arts.length}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={generate} disabled={generating || missingPrice || arts.length === 0}>
            {generating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Gerar .zip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
