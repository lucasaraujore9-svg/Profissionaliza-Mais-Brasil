// Composicao CLIENT-SIDE das artes de divulgacao: desenha a arte base + logo
// da unidade no topo + rodape padrao (site/whatsapp/rede social) + badge de
// preco opcional num <canvas>. O MESMO canvas serve de preview (escalado por
// CSS) e de arquivo final (toBlob) — o que a revenda ve e o que ela baixa.
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
  anchorsFor,
  contrastTextColor,
  formatPriceBRL,
  mirrorBoxLeft,
  textOnWhite,
  type LogoCorner,
  type TenantBrand,
} from "./types"

export interface ComposeParams {
  artUrl: string
  artWidth: number
  artHeight: number
  logoCorner: LogoCorner
  tenant: TenantBrand
  // Preco em centavos — so carimba o badge quando != null.
  priceCents?: number | null
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

// Carrega uma imagem com CORS habilitado para uso em canvas.
//
// Cache-bust `xcors=1`: o logo da unidade ja foi exibido no painel via <img>
// SEM crossorigin — o cache HTTP pode devolver essa resposta sem os headers
// CORS e taintar o canvas (bug classico do Chrome/Safari). A query exclusiva
// do modo CORS garante uma entrada de cache separada.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${url}`))
    img.src = url + (url.includes("?") ? "&" : "?") + "xcors=1"
  })
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
      // Carga defensiva do peso usado no rodape/badge.
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

export async function composeArt(
  canvas: HTMLCanvasElement,
  params: ComposeParams,
): Promise<void> {
  const { artUrl, artWidth, artHeight, logoCorner, tenant, priceCents } = params

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

  // O template das artes ja traz caixas BRANCAS arredondadas reservadas para o
  // logo (topo) e para os contatos (rodape) — desenhamos DENTRO delas, nas
  // posicoes medidas das artes de referencia (ART_ANCHORS por variante).
  const anchors = anchorsFor(artWidth, artHeight)
  const logoBoxRel =
    logoCorner === "top-left" ? mirrorBoxLeft(anchors.logoBox) : anchors.logoBox
  const logoBox = {
    x: logoBoxRel.x * artWidth,
    y: logoBoxRel.y * artHeight,
    w: logoBoxRel.w * artWidth,
    h: logoBoxRel.h * artHeight,
  }
  const footerBox = {
    x: anchors.footerBox.x * artWidth,
    y: anchors.footerBox.y * artHeight,
    w: anchors.footerBox.w * artWidth,
    h: anchors.footerBox.h * artHeight,
  }
  const inkColor = textOnWhite(tenant.primaryColor)

  // 2. Logo dentro da caixa reservada do topo (contain + padding interno).
  //    Sem logo: nome da unidade centrado na caixa, na cor da marca.
  const logoPad = logoBox.h * 0.16
  if (logoImg) {
    const maxW = logoBox.w - logoPad * 2
    const maxH = logoBox.h - logoPad * 2
    const scale = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
    const w = logoImg.naturalWidth * scale
    const h = logoImg.naturalHeight * scale
    ctx.drawImage(logoImg, logoBox.x + (logoBox.w - w) / 2, logoBox.y + (logoBox.h - h) / 2, w, h)
  } else {
    const maxW = logoBox.w - logoPad * 2
    let nameSize = Math.round(logoBox.h * 0.34)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = inkColor
    const fitsName = (size: number) => {
      ctx.font = `700 ${size}px ${family}`
      return ctx.measureText(tenant.name).width <= maxW
    }
    const minName = Math.round(logoBox.h * 0.2)
    while (nameSize > minName && !fitsName(nameSize)) nameSize -= 1
    ctx.font = `700 ${nameSize}px ${family}`
    ctx.fillText(tenant.name, logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2, maxW)
  }

  // 3. Contatos dentro da caixa branca do rodape: site / whatsapp / rede
  //    social em texto na cor da unidade (ou azul-marinho se a cor for clara).
  const items = [
    tenant.siteHost,
    tenant.whatsapp ? `WhatsApp ${tenant.whatsapp}` : null,
    tenant.social,
  ].filter((v): v is string => !!v)

  if (items.length > 0) {
    const padX = footerBox.w * 0.04
    const maxTextWidth = footerBox.w - padX * 2
    const baseFontSize = Math.round(clamp(footerBox.h * 0.3, 14, 46))
    const separator = "   •   "

    ctx.fillStyle = inkColor
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    const fits = (text: string, size: number) => {
      ctx.font = `600 ${size}px ${family}`
      return ctx.measureText(text).width <= maxTextWidth
    }

    const singleLine = items.join(separator)
    let fontSize = baseFontSize
    const minFontSize = Math.round(baseFontSize * 0.55)
    while (fontSize > minFontSize && !fits(singleLine, fontSize)) {
      fontSize -= 1
    }

    const cx = footerBox.x + footerBox.w / 2
    if (fits(singleLine, fontSize) || items.length === 1) {
      ctx.font = `600 ${fontSize}px ${family}`
      ctx.fillText(singleLine, cx, footerBox.y + footerBox.h / 2, maxTextWidth)
    } else {
      // Nomes longos: quebra em 2 linhas (site na 1a, contato+social na 2a).
      const line1 = items[0]
      const line2 = items.slice(1).join(separator)
      let size2 = baseFontSize
      while (size2 > minFontSize && (!fits(line1, size2) || !fits(line2, size2))) {
        size2 -= 1
      }
      ctx.font = `700 ${size2}px ${family}`
      ctx.fillText(line1, cx, footerBox.y + footerBox.h * 0.34, maxTextWidth)
      ctx.font = `600 ${size2}px ${family}`
      ctx.fillText(line2, cx, footerBox.y + footerBox.h * 0.68, maxTextWidth)
    }
  }

  // 4. Badge de preco (pill) ancorado acima da caixa do rodape, a direita.
  if (priceCents != null) {
    const label = formatPriceBRL(priceCents)
    const fontSize = Math.round(clamp(artWidth * 0.045, 18, 64))
    ctx.font = `800 ${fontSize}px ${family}`
    const textWidth = ctx.measureText(label).width
    const padX = fontSize * 0.7
    const padY = fontSize * 0.45
    const pillW = textWidth + padX * 2
    const pillH = fontSize + padY * 2
    const margin = artWidth * 0.03
    const x = footerBox.x + footerBox.w - pillW
    const y = footerBox.y - margin - pillH

    const bg = tenant.secondaryColor || "#1e40af"
    ctx.fillStyle = bg
    drawRoundRect(ctx, x, y, pillW, pillH, pillH / 2)
    ctx.fill()

    ctx.fillStyle = contrastTextColor(bg)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(label, x + pillW / 2, y + pillH / 2)
  }
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
