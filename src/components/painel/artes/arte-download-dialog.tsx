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
import type { ArtItem, TenantBrand } from "@/lib/artes/types"
import { formatPriceBRL, slugifyFilename } from "@/lib/artes/types"
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
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [state, setState] = useState<ComposeState>("loading")
  const [downloading, setDownloading] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  // Recompoe no preview quando abre/retry e quando o preco muda (debounce).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setState("loading")
    const timer = setTimeout(async () => {
      try {
        await composeArt(canvas, {
          artUrl: art.url,
          artWidth: art.width,
          artHeight: art.height,
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
  }, [art, brand, priceCents, retryKey])

  const needsPrice = art.hasPrice && priceCents == null

  async function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas || state !== "ready") return
    setDownloading(true)
    try {
      const format = outputFormatFor(art.url)
      const blob = await canvasToBlob(canvas, format.mime, format.quality)
      downloadBlob(blob, `${slugifyFilename(art.title)}-${brand.slug}.${format.ext}`)
      toast.success("Arte baixada")
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
          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {/* O canvas fica no tamanho REAL da arte; o CSS escala o preview. */}
            <canvas ref={canvasRef} className="block h-auto w-full" />
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
            Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
