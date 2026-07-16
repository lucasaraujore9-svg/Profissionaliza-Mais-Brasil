// Composicao CLIENT-SIDE das artes de divulgacao: desenha a arte base + logo
// da unidade + rodape de contatos (icones) + selo de preco opcional num
// <canvas>. O MESMO desenho serve de preview (escalado por CSS) e de arquivo
// final (toBlob) — o que a revenda ve e o que ela baixa.
//
// v3: logo e preco sao POSICIONAVEIS (VariantLayout definido pelo designer no
// upload e ajustavel pela revenda no download); os fundos brancos do logo e do
// rodape sao desenhados pelo sistema (toggles separados). A funcao devolve a
// geometria desenhada em pixels para o editor de arraste fazer hit-test.
//
// ADR: composicao no browser em vez de server-side (sharp/satori). Artes e
// logos estao em *.supabase.co (CORS `*`, CSP img-src permite), entao o canvas
// nao fica tainted com crossOrigin="anonymous". Zero custo de servidor e
// preview instantaneo. Plano B (se surgir taxa relevante de tainting em prod):
// rota POST /api/painel/artes/compose com sharp compondo o PNG no server.
//
// Este modulo so roda no client (usa document/canvas) — importar apenas de
// componentes "use client".

import {
  ART_ANCHORS,
  clampLogoPlacement,
  clampPricePlacement,
  contrastTextColor,
  footerGroups,
  formatPriceBRL,
  textOnWhite,
  type TenantBrand,
  type VariantLayout,
} from "./types"
import { drawIcon, iconFor } from "./icons"

export interface ComposeParams {
  artUrl: string
  artWidth: number
  artHeight: number
  tenant: TenantBrand
  // Preco em centavos — so carimba o selo quando != null.
  priceCents?: number | null
  // Layout resolvido pelo caller (default do designer ou ajuste da revenda).
  layout: VariantLayout
}

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ComposedGeometry {
  // Retangulo do PLACEMENT do logo (caixa de contain — estavel p/ hit-test).
  logoRect: PixelRect
  // Retangulo real do pill de preco desenhado (null sem preco).
  priceRect: PixelRect | null
  footerRect: PixelRect
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

// Cache de imagens decodificadas — essencial para recompor a ~60fps durante o
// arraste do editor sem re-decodar (URLs sao imutaveis: paths UUID no bucket e
// objectURLs por sessao).
const imageCache = new Map<string, Promise<HTMLImageElement>>()

// Carrega uma imagem com CORS habilitado para uso em canvas.
//
// Cache-bust `xcors=1`: o logo da unidade ja foi exibido no painel via <img>
// SEM crossorigin — o cache HTTP pode devolver essa resposta sem os headers
// CORS e taintar o canvas (bug classico do Chrome/Safari). A query exclusiva
// do modo CORS garante uma entrada de cache separada.
//
// blob:/data: (preview local do editor do admin antes do upload): sem query
// (quebraria a resolucao do blob) e sem crossOrigin — same-origin nao tainta.
function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached) return cached
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    const isLocal = /^(blob|data):/.test(url)
    if (!isLocal) {
      img.crossOrigin = "anonymous"
    }
    img.onload = () => resolve(img)
    img.onerror = () => {
      imageCache.delete(url)
      reject(new Error(`Falha ao carregar imagem: ${url}`))
    }
    img.src = isLocal ? url : url + (url.includes("?") ? "&" : "?") + "xcors=1"
  })
  imageCache.set(url, promise)
  return promise
}

// Resolve a familia de fonte real do app para uso no canvas. O next/font
// registra a DM Sans com nome hasheado (ex: "__DM_Sans_abc123"), entao
// "DM Sans" literal NAO casa — lemos a familia computada do body.
async function ensureFonts(): Promise<string> {
  let family = "sans-serif"
  try {
    await document.fonts.ready
    const computed = getComputedStyle(document.body).fontFamily
    const first = computed.split(",")[0]?.trim().replace(/^["']|["']$/g, "")
    if (first) {
      family = `"${first}", sans-serif`
      // Carga defensiva do peso usado no rodape/selo.
      await document.fonts.load(`600 32px ${family}`).catch(() => undefined)
    }
  } catch {
    // fonts API indisponivel: segue com sans-serif
  }
  return family
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

// Sombra de legibilidade para texto/icone SEM fundo branco, sobre a arte.
function setInkShadow(ctx: CanvasRenderingContext2D, fontSize: number, on: boolean) {
  if (on) {
    ctx.shadowColor = "rgba(0,0,0,0.55)"
    ctx.shadowBlur = fontSize * 0.35
    ctx.shadowOffsetY = fontSize * 0.06
  } else {
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }
}

interface MeasuredGroup {
  icon: ReturnType<typeof iconFor>
  text: string
  textW: number
}

// Desenha uma linha de grupos [icone + texto] centrada em (cx, centerY).
// Reduz a fonte ate caber em maxW (piso 55%). Retorna o fontSize usado.
function drawGroupsLine(
  ctx: CanvasRenderingContext2D,
  family: string,
  groups: { icon: ReturnType<typeof iconFor>; text: string }[],
  weight: number,
  baseFontSize: number,
  cx: number,
  centerY: number,
  maxW: number,
  ink: string,
  shadow: boolean,
): void {
  if (groups.length === 0) return
  const minFontSize = Math.round(baseFontSize * 0.55)
  let fontSize = baseFontSize
  let measured: MeasuredGroup[] = []
  let totalW = 0

  const measure = (size: number) => {
    ctx.font = `${weight} ${size}px ${family}`
    const iconSize = size * 1.15
    const gapIconText = size * 0.35
    const gapGroups = size * 1.4
    measured = groups.map((g) => ({
      ...g,
      textW: ctx.measureText(g.text).width,
    }))
    totalW =
      measured.reduce((acc, g) => acc + iconSize + gapIconText + g.textW, 0) +
      gapGroups * (groups.length - 1)
    return { iconSize, gapIconText, gapGroups }
  }

  let dims = measure(fontSize)
  while (fontSize > minFontSize && totalW > maxW) {
    fontSize -= 1
    dims = measure(fontSize)
  }

  ctx.fillStyle = ink
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  setInkShadow(ctx, fontSize, shadow)

  let x = cx - totalW / 2
  for (const g of measured) {
    drawIcon(ctx, g.icon, x, centerY - dims.iconSize / 2, dims.iconSize, ink)
    // drawIcon faz save/restore — o shadow do texto precisa ser re-aplicado ao
    // proprio fillText (shadow e estado do ctx, preservado fora do save).
    ctx.font = `${weight} ${fontSize}px ${family}`
    ctx.fillStyle = ink
    ctx.fillText(g.text, x + dims.iconSize + dims.gapIconText, centerY)
    x += dims.iconSize + dims.gapIconText + g.textW + dims.gapGroups
  }
  setInkShadow(ctx, fontSize, false)
}

export async function composeArt(
  canvas: HTMLCanvasElement,
  params: ComposeParams,
): Promise<ComposedGeometry> {
  const { artUrl, artWidth, artHeight, tenant, priceCents } = params
  const layout: VariantLayout = {
    logo: clampLogoPlacement(params.layout.logo),
    ...(params.layout.price ? { price: clampPricePlacement(params.layout.price) } : {}),
    footerBg: params.layout.footerBg,
    ...(params.layout.footerColor ? { footerColor: params.layout.footerColor } : {}),
  }

  const [family, artImg, logoImg] = await Promise.all([
    ensureFonts(),
    loadImage(artUrl),
    // Logo que falha (404/CORS) degrada para "sem logo" — nao aborta a arte.
    tenant.logoUrl
      ? loadImage(tenant.logoUrl).catch((err) => {
          // Modulo browser-only (canvas): console e o canal certo aqui, como
          // em logger-client.ts — Pino/contextLogger nao roda no client.
          // eslint-disable-next-line no-console
          console.warn("[artes] logo indisponível, compondo sem logo:", err)
          return null
        })
      : Promise.resolve(null),
  ])

  canvas.width = artWidth
  canvas.height = artHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D não suportado neste navegador")

  // 1. Arte base preenchendo o canvas (dimensoes vem do banco = naturais).
  ctx.drawImage(artImg, 0, 0, artWidth, artHeight)

  // 2. Rodape (posicao FIXA nas ancoras da variante; fica ATRAS de logo/preco
  //    se sobrepostos — os elementos moveis sempre por cima).
  const kind = artHeight / artWidth >= 1.4 ? "story" : "feed"
  const fb = ART_ANCHORS[kind].footerBox
  const footerRect: PixelRect = {
    x: fb.x * artWidth,
    y: fb.y * artHeight,
    w: fb.w * artWidth,
    h: fb.h * artHeight,
  }

  const groups = footerGroups(tenant).map((g) => ({ icon: iconFor(g.icon), text: g.text }))
  if (layout.footerBg) {
    ctx.fillStyle = "#ffffff"
    drawRoundRect(ctx, footerRect.x, footerRect.y, footerRect.w, footerRect.h, footerRect.h * 0.22)
    ctx.fill()
  }
  // Cor custom do designer/revenda vence; senao a automatica. A sombra de
  // legibilidade acompanha a ausencia de fundo, independente da cor.
  const footerInk =
    layout.footerColor ?? (layout.footerBg ? textOnWhite(tenant.primaryColor) : "#ffffff")
  const footerShadow = !layout.footerBg
  const footerCx = footerRect.x + footerRect.w / 2
  const maxLineW = footerRect.w * 0.92

  if (kind === "story") {
    // Empilhado: site em destaque na 1a linha; contato + rede na 2a.
    const line2 = groups.slice(1)
    const font1 = Math.round(clamp(footerRect.h * 0.3, 18, 60))
    if (line2.length === 0) {
      drawGroupsLine(ctx, family, groups.slice(0, 1), 800, font1, footerCx, footerRect.y + footerRect.h * 0.5, maxLineW, footerInk, footerShadow)
    } else {
      drawGroupsLine(ctx, family, groups.slice(0, 1), 800, font1, footerCx, footerRect.y + footerRect.h * 0.38, maxLineW, footerInk, footerShadow)
      drawGroupsLine(ctx, family, line2, 600, Math.round(font1 * 0.62), footerCx, footerRect.y + footerRect.h * 0.7, maxLineW, footerInk, footerShadow)
    }
  } else {
    // Feed: 1 linha com todos os grupos.
    const base = Math.round(clamp(footerRect.h * 0.32, 14, 44))
    drawGroupsLine(ctx, family, groups, 600, base, footerCx, footerRect.y + footerRect.h / 2, maxLineW, footerInk, footerShadow)
  }

  // 3. Logo no placement (caixa de contain arrastavel/redimensionavel).
  const logoRect: PixelRect = {
    x: (layout.logo.cx - layout.logo.w / 2) * artWidth,
    y: (layout.logo.cy - layout.logo.h / 2) * artHeight,
    w: layout.logo.w * artWidth,
    h: layout.logo.h * artHeight,
  }
  if (logoImg) {
    const scale = Math.min(logoRect.w / logoImg.naturalWidth, logoRect.h / logoImg.naturalHeight)
    const w = logoImg.naturalWidth * scale
    const h = logoImg.naturalHeight * scale
    const x = logoRect.x + (logoRect.w - w) / 2
    const y = logoRect.y + (logoRect.h - h) / 2
    if (layout.logo.bg) {
      const pad = Math.max(w, h) * 0.12
      ctx.fillStyle = "#ffffff"
      drawRoundRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, pad)
      ctx.fill()
    }
    ctx.drawImage(logoImg, x, y, w, h)
  } else {
    // Sem logo: nome da unidade dentro da caixa.
    if (layout.logo.bg) {
      ctx.fillStyle = "#ffffff"
      drawRoundRect(ctx, logoRect.x, logoRect.y, logoRect.w, logoRect.h, logoRect.h * 0.18)
      ctx.fill()
    }
    const ink = layout.logo.bg ? textOnWhite(tenant.primaryColor) : "#ffffff"
    const maxW = logoRect.w * 0.9
    let nameSize = Math.round(logoRect.h * 0.34)
    const minName = Math.max(10, Math.round(logoRect.h * 0.16))
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const fitsName = (size: number) => {
      ctx.font = `700 ${size}px ${family}`
      return ctx.measureText(tenant.name).width <= maxW
    }
    while (nameSize > minName && !fitsName(nameSize)) nameSize -= 1
    ctx.font = `700 ${nameSize}px ${family}`
    ctx.fillStyle = ink
    setInkShadow(ctx, nameSize, !layout.logo.bg)
    ctx.fillText(tenant.name, logoRect.x + logoRect.w / 2, logoRect.y + logoRect.h / 2, maxW)
    setInkShadow(ctx, nameSize, false)
  }

  // 4. Selo de preco no placement (pill com fundo proprio na cor secundaria).
  let priceRect: PixelRect | null = null
  if (priceCents != null && layout.price) {
    const label = formatPriceBRL(priceCents)
    const fontSize = Math.round(clamp(artWidth * 0.045, 18, 64) * layout.price.scale)
    ctx.font = `800 ${fontSize}px ${family}`
    const textWidth = ctx.measureText(label).width
    const padX = fontSize * 0.7
    const padY = fontSize * 0.45
    const pillW = textWidth + padX * 2
    const pillH = fontSize + padY * 2
    const x = clamp(layout.price.cx * artWidth - pillW / 2, 0, artWidth - pillW)
    const y = clamp(layout.price.cy * artHeight - pillH / 2, 0, artHeight - pillH)

    const bg = tenant.secondaryColor || "#1e40af"
    ctx.fillStyle = bg
    drawRoundRect(ctx, x, y, pillW, pillH, pillH / 2)
    ctx.fill()

    ctx.fillStyle = contrastTextColor(bg)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(label, x + pillW / 2, y + pillH / 2)
    priceRect = { x, y, w: pillW, h: pillH }
  }

  return { logoRect, priceRect, footerRect }
}

// toBlob com fallback toDataURL (Safari antigo) e erro claro quando o canvas
// esta tainted (SecurityError de CORS).
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
            return
          }
          // Alguns Safaris retornam null — fallback via dataURL.
          try {
            const dataUrl = canvas.toDataURL(mime, quality)
            const [, base64] = dataUrl.split(",")
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            resolve(new Blob([bytes], { type: mime }))
          } catch (err) {
            reject(err)
          }
        },
        mime,
        quality,
      )
    } catch (err) {
      reject(err)
    }
  })
}

export function isCanvasSecurityError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "SecurityError") ||
    (err instanceof Error && /tainted|SecurityError/i.test(err.message))
  )
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Formato de saida fiel a origem: JPEG (menor) quando a arte base e JPEG,
// PNG nos demais casos.
export function outputFormatFor(artUrl: string): {
  mime: "image/png" | "image/jpeg"
  ext: "png" | "jpg"
  quality?: number
} {
  if (/\.jpe?g(\?|$)/i.test(artUrl)) {
    return { mime: "image/jpeg", ext: "jpg", quality: 0.92 }
  }
  return { mime: "image/png", ext: "png" }
}
