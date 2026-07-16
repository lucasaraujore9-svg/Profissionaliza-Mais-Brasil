import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { isProxyableImageUrl } from "@/lib/images"
import { logger } from "@/lib/logger"

// Proxy de redimensionamento de imagem — substitui o otimizador da Vercel
// (desligado por cota, ver next.config.ts). O loader customizado do
// next/image aponta para cá; devolvemos WebP no tamanho pedido com cache
// longo no CDN, então cada variante busca o origin UMA vez.
//
// Falha de forma aberta: qualquer erro (origin fora, timeout, payload que não
// é imagem) responde 302 para a URL original — o navegador carrega direto,
// que é exatamente o comportamento anterior a este proxy. Imagem nunca quebra
// por causa do proxy; no pior caso volta a pesar o que pesava.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mesma escala do otimizador do Next (imageSizes + deviceSizes, teto 1920):
// snap para cima limita a explosão de variantes no cache do CDN.
const ALLOWED_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920]

const FETCH_TIMEOUT_MS = 8_000
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

const CACHE_OK = "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400"
// Falhas cacheiam curto: um origin instável não derruba o proxy sob rajada,
// mas a recuperação acontece em minutos.
const CACHE_FAIL = "public, max-age=60, s-maxage=300"

function snapWidth(raw: string | null): number {
  const w = Number(raw)
  if (!Number.isFinite(w) || w <= 0) return 640
  for (const allowed of ALLOWED_WIDTHS) {
    if (w <= allowed) return allowed
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]
}

function clampQuality(raw: string | null): number {
  const q = Number(raw)
  if (!Number.isFinite(q)) return 70
  return Math.min(85, Math.max(40, Math.round(q)))
}

function redirectToOrigin(url: string): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": CACHE_FAIL },
  })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const url = params.get("url")

  // Fora da allowlist não tem nem redirect: evita usar a rota como open
  // redirector / proxy SSRF para hosts arbitrários.
  if (!url || !isProxyableImageUrl(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  const width = snapWidth(params.get("w"))
  const quality = clampQuality(params.get("q"))

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "image/*" },
    })

    // fetch segue redirects: valida o destino final também (um 301 do origin
    // não pode nos fazer buscar um host fora da allowlist).
    if (!upstream.ok || !isProxyableImageUrl(upstream.url)) {
      return redirectToOrigin(url)
    }

    const length = Number(upstream.headers.get("content-length") ?? 0)
    if (length > MAX_SOURCE_BYTES) return redirectToOrigin(url)

    const source = Buffer.from(await upstream.arrayBuffer())
    if (source.byteLength === 0 || source.byteLength > MAX_SOURCE_BYTES) {
      return redirectToOrigin(url)
    }

    // .rotate() aplica a orientação EXIF (fotos de celular viram banner);
    // withoutEnlargement nunca sobe além do original.
    const output = await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(output.byteLength),
        "Cache-Control": CACHE_OK,
      },
    })
  } catch (err) {
    // Origin lento/fora ou payload que o sharp não decodifica: degrada para a
    // imagem original, nunca para uma imagem quebrada.
    logger.warn({ err: String(err), url, width, event: "img_proxy.fallback" }, "Proxy de imagem caiu no fallback")
    return redirectToOrigin(url)
  }
}
