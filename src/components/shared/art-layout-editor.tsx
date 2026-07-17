"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { TenantBrand, VariantLayout } from "@/lib/artes/types"
import {
  ART_ANCHORS,
  clampFooterPlacement,
  clampLogoPlacement,
  clampPricePlacement,
  FOOTER_PAD_DEFAULT,
  LOGO_PAD_DEFAULT,
  PRICE_PAD_DEFAULT,
} from "@/lib/artes/types"
import { composeArt, type ComposedGeometry } from "@/lib/artes/compose"

export type EditorState = "loading" | "ready" | "error"

// Marca de amostra usada no editor do ADMIN (o designer posiciona sem conhecer
// a unidade). Logo placeholder gerado em canvas -> dataURL (sem CORS).
let sampleLogoUrl: string | null = null
function sampleLogoDataUrl(): string {
  if (sampleLogoUrl) return sampleLogoUrl
  const canvas = document.createElement("canvas")
  canvas.width = 480
  canvas.height = 300
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.fillStyle = "#e5e7eb"
  const r = 24
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(480, 0, 480, 300, r)
  ctx.arcTo(480, 300, 0, 300, r)
  ctx.arcTo(0, 300, 0, 0, r)
  ctx.arcTo(0, 0, 480, 0, r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = "#6b7280"
  ctx.font = "700 64px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("SUA LOGO", 240, 150)
  sampleLogoUrl = canvas.toDataURL("image/png")
  return sampleLogoUrl
}

let cachedSampleBrand: TenantBrand | null = null
export function sampleBrand(): TenantBrand {
  if (!cachedSampleBrand) {
    cachedSampleBrand = {
      name: "Sua Unidade",
      slug: "amostra",
      logoUrl: sampleLogoDataUrl() || null,
      primaryColor: "#1e40af",
      secondaryColor: "#1e40af",
      siteHost: "suaunidade.livrecursos.com.br",
      whatsapp: "(11) 99999-9999",
      social: { kind: "instagram", handle: "@suaunidade" },
    }
  }
  return cachedSampleBrand
}

interface DragState {
  target: "logo" | "price" | "footer"
  offsetX: number // pointer - centro do elemento (px do canvas)
  offsetY: number
}

// Folga de hit-test para dedo em mobile.
const HIT_SLOP = 12

function hitTest(
  geometry: ComposedGeometry,
  x: number,
  y: number,
): "logo" | "price" | "footer" | null {
  const within = (r: { x: number; y: number; w: number; h: number }) =>
    x >= r.x - HIT_SLOP && x <= r.x + r.w + HIT_SLOP && y >= r.y - HIT_SLOP && y <= r.y + r.h + HIT_SLOP
  // Do menor para o maior: preco -> logo -> rodape.
  if (geometry.priceRect && within(geometry.priceRect)) return "price"
  if (within(geometry.logoRect)) return "logo"
  if (within(geometry.footerRect)) return "footer"
  return null
}

// ---- controles laterais (agrupados por elemento, para nao confundir) ----

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 space-y-2 break-inside-avoid rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {children}
    </div>
  )
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-gray-600">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-pmb-green)]"
      />
    </label>
  )
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <span className="text-sm text-gray-800">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

// Cor com opcao "Automática" (limpa a cor custom) + seletor. `color` ausente =
// automatica.
function ColorRow({
  label,
  color,
  onAuto,
  onPick,
}: {
  label: string
  color?: string
  onAuto: () => void
  onPick: (hex: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <span className="text-sm text-gray-800">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAuto}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            !color
              ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green)]"
              : "border-gray-200 text-gray-600 hover:border-gray-300",
          )}
        >
          Automática
        </button>
        <input
          type="color"
          aria-label={label}
          value={color ?? "#ffffff"}
          onChange={(e) => onPick(e.target.value)}
          className={cn(
            "h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5",
            color ? "border-[var(--color-pmb-green)]" : "border-gray-200",
          )}
        />
      </div>
    </div>
  )
}

export function ArtLayoutEditor({
  artUrl,
  artWidth,
  artHeight,
  brand,
  hasPrice,
  samplePriceCents = 19990,
  value,
  onChange,
  onStateChange,
  className,
  headerControls,
}: {
  artUrl: string
  artWidth: number
  artHeight: number
  brand: TenantBrand
  hasPrice: boolean
  // Valor usado no pill quando hasPrice (amostra ou o digitado pela revenda).
  samplePriceCents?: number
  value: VariantLayout
  onChange: (next: VariantLayout) => void
  onStateChange?: (state: EditorState) => void
  className?: string
  // Controles extras (versao/preco/zip) renderizados NO TOPO da coluna lateral,
  // para que nada alem da arte fique embaixo da previa.
  headerControls?: ReactNode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const geometryRef = useRef<ComposedGeometry | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const rafRef = useRef<number | null>(null)
  const latestValue = useRef(value)
  latestValue.current = value
  const [state, setState] = useState<EditorState>("loading")
  const [retryKey, setRetryKey] = useState(0)
  const [cursor, setCursor] = useState<"default" | "move">("default")

  function report(next: EditorState) {
    setState(next)
    onStateChange?.(next)
  }

  // Recompoe quando layout/arte/marca mudam. Durante o drag as recomposicoes
  // sao agendadas via requestAnimationFrame (cache de imagens torna o draw
  // barato); fora do drag, debounce curto.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const compose = async () => {
      try {
        const geometry = await composeArt(canvas, {
          artUrl,
          artWidth,
          artHeight,
          tenant: brand,
          priceCents: hasPrice ? samplePriceCents : null,
          layout: latestValue.current,
        })
        if (cancelled) return
        geometryRef.current = geometry
        drawGuides(canvas, geometry)
        report("ready")
      } catch (err) {
        console.error("[artes] falha ao compor editor:", err)
        if (!cancelled) report("error")
      }
    }
    if (dragRef.current) {
      // Em arraste: 1 frame por rAF, sem debounce.
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          void compose()
        })
      }
      return
    }
    if (state !== "ready") report("loading")
    const timer = setTimeout(() => void compose(), 60)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, artUrl, artWidth, artHeight, brand, hasPrice, samplePriceCents, retryKey])

  // Guias tracejadas por cima da composicao — SO no canvas do editor (o
  // download compoe num canvas descartavel limpo em composeVariantBlob).
  function drawGuides(canvas: HTMLCanvasElement, geometry: ComposedGeometry) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const stroke = (r: { x: number; y: number; w: number; h: number }) => {
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.lineWidth = Math.max(2, canvas.width * 0.002)
      ctx.strokeStyle = "rgba(37, 99, 235, 0.9)"
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.restore()
    }
    stroke(geometry.logoRect)
    if (geometry.priceRect) stroke(geometry.priceRect)
    stroke(geometry.footerRect)
  }

  function toCanvasXY(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget
    const r = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const geometry = geometryRef.current
    if (!geometry) return
    const { x, y } = toCanvasXY(e)
    const target = hitTest(geometry, x, y)
    if (!target) return
    if (target === "price" && (!hasPrice || !value.price)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect =
      target === "price"
        ? geometry.priceRect!
        : target === "footer"
          ? geometry.footerRect
          : geometry.logoRect
    dragRef.current = {
      target,
      offsetX: x - (rect.x + rect.w / 2),
      offsetY: y - (rect.y + rect.h / 2),
    }
  }

  // Placement atual do rodape (layouts salvos antes do rodape posicionavel
  // nao tem `footer` — deriva da ancora legada da variante).
  function currentFooter() {
    if (latestValue.current.footer) return latestValue.current.footer
    const fb = ART_ANCHORS[artHeight / artWidth >= 1.4 ? "story" : "feed"].footerBox
    return { cx: fb.x + fb.w / 2, cy: fb.y + fb.h / 2, w: fb.w }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    const geometry = geometryRef.current
    if (!drag) {
      // Hover (desktop): cursor move sobre elementos arrastaveis.
      if (geometry) {
        const { x, y } = toCanvasXY(e)
        setCursor(hitTest(geometry, x, y) ? "move" : "default")
      }
      return
    }
    const { x, y } = toCanvasXY(e)
    const cx = (x - drag.offsetX) / artWidth
    const cy = (y - drag.offsetY) / artHeight
    if (drag.target === "logo") {
      onChange({
        ...latestValue.current,
        logo: clampLogoPlacement({ ...latestValue.current.logo, cx, cy }),
      })
    } else if (drag.target === "footer") {
      onChange({
        ...latestValue.current,
        footer: clampFooterPlacement({ ...currentFooter(), cx, cy }),
      })
    } else if (latestValue.current.price) {
      onChange({
        ...latestValue.current,
        price: clampPricePlacement({ ...latestValue.current.price, cx, cy }),
      })
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      dragRef.current = null
      // Recompoe uma ultima vez fora do rAF do drag.
      onChange({ ...latestValue.current })
    }
  }

  function setLogoWidth(pct: number) {
    const logo = latestValue.current.logo
    const w = pct / 100
    // Escala uniforme: a razao w/h da caixa e preservada.
    const h = logo.h * (w / logo.w)
    onChange({
      ...latestValue.current,
      logo: clampLogoPlacement({ ...logo, w, h }),
    })
  }

  return (
    // Duas colunas no desktop: previa a esquerda, controles a direita — o
    // usuario ve a edicao acontecendo enquanto ajusta. Empilha no mobile.
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4", className)}>
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <canvas
          ref={canvasRef}
          className={cn(
            "block h-auto w-full",
            artHeight / artWidth >= 1.4 && "mx-auto max-w-[300px]",
          )}
          style={{ touchAction: "none", cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70">
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

      {/* Coluna de controles (ao lado no desktop) — cards em 2 colunas p/ evitar rolagem */}
      <div className="w-full space-y-3 lg:w-[34rem] lg:shrink-0">
      <p className="text-xs text-gray-500">
        Arraste o logo, o rodapé{hasPrice ? " e o preço" : ""} na prévia para posicionar.
      </p>

      <div className="gap-3 sm:columns-2">
      {headerControls && <div className="mb-3 break-inside-avoid">{headerControls}</div>}

      <ControlGroup title="Logo">
        <RangeRow
          label="Tamanho do logo"
          min={8}
          max={50}
          step={0.5}
          value={Math.round(value.logo.w * 1000) / 10}
          onChange={(v) => setLogoWidth(v)}
        />
        <SwitchRow
          label="Fundo branco no logo"
          checked={value.logo.bg}
          onCheckedChange={(bg) =>
            onChange({ ...latestValue.current, logo: { ...latestValue.current.logo, bg } })
          }
        />
        {value.logo.bg && (
          <RangeRow
            label="Tamanho do fundo do logo"
            min={0}
            max={50}
            step={1}
            value={Math.round((value.logo.pad ?? LOGO_PAD_DEFAULT) * 100)}
            onChange={(v) =>
              onChange({
                ...latestValue.current,
                logo: { ...latestValue.current.logo, pad: v / 100 },
              })
            }
          />
        )}
      </ControlGroup>

      <ControlGroup title="Rodapé (contatos)">
        <RangeRow
          label="Largura do rodapé"
          min={30}
          max={100}
          step={1}
          value={Math.round(currentFooter().w * 100)}
          onChange={(v) =>
            onChange({
              ...latestValue.current,
              footer: clampFooterPlacement({ ...currentFooter(), w: v / 100 }),
            })
          }
        />
        <SwitchRow
          label="Fundo branco no rodapé"
          checked={value.footerBg}
          onCheckedChange={(footerBg) => onChange({ ...latestValue.current, footerBg })}
        />
        {value.footerBg && (
          <RangeRow
            label="Tamanho do fundo do rodapé"
            min={0}
            max={200}
            step={5}
            value={Math.round((value.footerPad ?? FOOTER_PAD_DEFAULT) * 100)}
            onChange={(v) => onChange({ ...latestValue.current, footerPad: v / 100 })}
          />
        )}
        <ColorRow
          label="Cor do texto"
          color={value.footerColor}
          onAuto={() => {
            const next = { ...latestValue.current }
            delete next.footerColor
            onChange(next)
          }}
          onPick={(hex) => onChange({ ...latestValue.current, footerColor: hex })}
        />
      </ControlGroup>

      {hasPrice && value.price && (
        <ControlGroup title="Selo de preço">
          <RangeRow
            label="Tamanho do valor"
            min={0.6}
            max={2}
            step={0.05}
            value={value.price.scale}
            onChange={(v) =>
              onChange({
                ...latestValue.current,
                price: clampPricePlacement({ ...latestValue.current.price!, scale: v }),
              })
            }
          />
          <RangeRow
            label="Tamanho do fundo"
            min={0.4}
            max={2.5}
            step={0.05}
            value={value.price.pad ?? PRICE_PAD_DEFAULT}
            onChange={(v) =>
              onChange({
                ...latestValue.current,
                price: clampPricePlacement({ ...latestValue.current.price!, pad: v }),
              })
            }
          />
          <ColorRow
            label="Cor do fundo"
            color={value.price.bgColor}
            onAuto={() => {
              const price = { ...latestValue.current.price! }
              delete price.bgColor
              onChange({ ...latestValue.current, price })
            }}
            onPick={(hex) =>
              onChange({
                ...latestValue.current,
                price: { ...latestValue.current.price!, bgColor: hex },
              })
            }
          />
          <ColorRow
            label="Cor do valor"
            color={value.price.textColor}
            onAuto={() => {
              const price = { ...latestValue.current.price! }
              delete price.textColor
              onChange({ ...latestValue.current, price })
            }}
            onPick={(hex) =>
              onChange({
                ...latestValue.current,
                price: { ...latestValue.current.price!, textColor: hex },
              })
            }
          />
        </ControlGroup>
      )}
      </div>
      </div>
    </div>
  )
}
