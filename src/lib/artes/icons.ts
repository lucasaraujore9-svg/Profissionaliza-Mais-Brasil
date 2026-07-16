// Icones vetoriais do rodape das artes, desenhados direto no canvas (sem
// assets externos — zero CORS). ViewBox 24. Fontes dos paths: Lucide (licenca
// ISC, permite embutir) para os stroke-based; Simple Icons (CC0) para as
// marcas fill-based (WhatsApp, TikTok).
//
// IMPORTANTE: icones Lucide sao STROKE-based (contorno, stroke-width 2) —
// `ctx.fill()` neles renderiza errado. Cada icone declara o modo.

import type { SocialKind } from "./types"

export interface CanvasIcon {
  d: string // path SVG (viewBox 0 0 24 24; aceita multiplos subpaths)
  mode: "stroke" | "fill"
}

export const ICON_GLOBE: CanvasIcon = {
  // Lucide "globe"
  d: "M21.54 15H17a2 2 0 0 0-2 2v4.54 M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17 M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  mode: "stroke",
}

export const ICON_WHATSAPP: CanvasIcon = {
  // Simple Icons "whatsapp" (CC0)
  d: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  mode: "fill",
}

export const SOCIAL_ICONS: Record<SocialKind, CanvasIcon> = {
  instagram: {
    // Lucide "instagram"
    d: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z M17.5 6.5h.01",
    mode: "stroke",
  },
  facebook: {
    // Lucide "facebook"
    d: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
    mode: "stroke",
  },
  youtube: {
    // Lucide "youtube"
    d: "M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17 M10 15l5-3-5-3z",
    mode: "stroke",
  },
  tiktok: {
    // Simple Icons "tiktok" (CC0)
    d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
    mode: "fill",
  },
}

export function iconFor(key: "globe" | "whatsapp" | SocialKind): CanvasIcon {
  if (key === "globe") return ICON_GLOBE
  if (key === "whatsapp") return ICON_WHATSAPP
  return SOCIAL_ICONS[key]
}

// Path2D e reutilizavel entre draws — cache por path string.
const pathCache = new Map<string, Path2D>()

function pathFor(d: string): Path2D {
  let p = pathCache.get(d)
  if (!p) {
    p = new Path2D(d)
    pathCache.set(d, p)
  }
  return p
}

// Desenha o icone com canto superior esquerdo em (x, y) e lado `size`.
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: CanvasIcon,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  const path = pathFor(icon.d)
  if (icon.mode === "stroke") {
    ctx.strokeStyle = color
    // lineWidth em unidades locais escala junto com ctx.scale — correto.
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.stroke(path)
  } else {
    ctx.fillStyle = color
    ctx.fill(path)
  }
  ctx.restore()
}
