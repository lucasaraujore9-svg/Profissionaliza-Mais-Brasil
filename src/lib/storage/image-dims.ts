/**
 * Extrai largura/altura de PNG, JPEG e WEBP lendo o cabecalho binario.
 *
 * Sem dependencias externas. Para JPEGs progressive precisamos escanear ate o
 * primeiro marker SOF — limitado aos primeiros 256KB ja basta para qualquer
 * banner razoavel.
 *
 * Retorna `null` se o formato nao for reconhecido ou o buffer estiver truncado.
 */

export interface ImageDimensions {
  width: number
  height: number
}

export function readImageDimensions(
  buffer: ArrayBuffer | Buffer,
  declaredMime: string,
): ImageDimensions | null {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (bytes.length < 24) return null

  switch (declaredMime) {
    case "image/png":
      return readPngDimensions(bytes)
    case "image/jpeg":
    case "image/jpg":
      return readJpegDimensions(bytes)
    case "image/webp":
      return readWebpDimensions(bytes)
    default:
      return null
  }
}

function readPngDimensions(b: Buffer): ImageDimensions | null {
  // PNG signature + IHDR chunk: width @ byte 16, height @ byte 20 (big-endian uint32)
  if (b.length < 24) return null
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) {
    return null
  }
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
}

function readJpegDimensions(b: Buffer): ImageDimensions | null {
  // JPEG: precisamos escanear segmentos ate achar um SOFn (Start Of Frame).
  // SOFn markers: 0xFFC0..0xFFCF excluindo 0xFFC4 (DHT), 0xFFC8 (JPG), 0xFFCC (DAC).
  if (b[0] !== 0xff || b[1] !== 0xd8) return null

  const limit = Math.min(b.length, 256 * 1024)
  let i = 2
  while (i + 9 < limit) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    // pula bytes 0xFF de padding
    while (i < limit && b[i] === 0xff) i++
    if (i >= limit) return null
    const marker = b[i]
    i++
    // markers sem payload
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }
    if (i + 1 >= limit) return null
    const segLen = b.readUInt16BE(i)
    // SOF marker? 0xC0-0xCF exceto C4, C8, CC
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      // Estrutura SOF: len(2) + precision(1) + height(2) + width(2)
      if (i + 7 >= limit) return null
      const height = b.readUInt16BE(i + 3)
      const width = b.readUInt16BE(i + 5)
      if (!width || !height) return null
      return { width, height }
    }
    i += segLen
  }
  return null
}

function readWebpDimensions(b: Buffer): ImageDimensions | null {
  if (b.length < 30) return null
  // "RIFF" .... "WEBP"
  if (
    b[0] !== 0x52 ||
    b[1] !== 0x49 ||
    b[2] !== 0x46 ||
    b[3] !== 0x46 ||
    b[8] !== 0x57 ||
    b[9] !== 0x45 ||
    b[10] !== 0x42 ||
    b[11] !== 0x50
  ) {
    return null
  }
  // Chunk id em bytes 12-15
  const chunk = b.toString("ascii", 12, 16)
  if (chunk === "VP8X") {
    // VP8X: bytes 24-26 = width-1 (24-bit LE), 27-29 = height-1 (24-bit LE)
    const w = b[24] | (b[25] << 8) | (b[26] << 16)
    const h = b[27] | (b[28] << 8) | (b[29] << 16)
    return { width: w + 1, height: h + 1 }
  }
  if (chunk === "VP8L") {
    // VP8L: byte 20 = 0x2F signature, depois 14 bits w-1 + 14 bits h-1 (LE)
    if (b[20] !== 0x2f) return null
    const b21 = b[21]
    const b22 = b[22]
    const b23 = b[23]
    const b24 = b[24]
    const width = 1 + (((b22 & 0x3f) << 8) | b21)
    const height =
      1 + (((b24 & 0x0f) << 10) | (b23 << 2) | ((b22 & 0xc0) >> 6))
    return { width, height }
  }
  if (chunk === "VP8 ") {
    // VP8 lossy: 3 bytes (frame tag) + 3 bytes start code 9D 01 2A + 2 bytes w + 2 bytes h
    // start code esperado em bytes 23-25
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    const width = b.readUInt16LE(26) & 0x3fff
    const height = b.readUInt16LE(28) & 0x3fff
    if (!width || !height) return null
    return { width, height }
  }
  return null
}

/**
 * Especificacao do banner (desktop e mobile). Tolerancia em pixels.
 */
export const BANNER_SPEC = {
  desktop: { width: 1920, height: 600 },
  mobile: { width: 1080, height: 1080 },
  tolerancePx: 2,
} as const

export type BannerSlot = "desktop" | "mobile"

export interface DimensionCheck {
  ok: boolean
  expected: { width: number; height: number }
  got: { width: number; height: number } | null
  message?: string
}

export function checkBannerDimensions(
  buffer: ArrayBuffer | Buffer,
  mime: string,
  slot: BannerSlot,
): DimensionCheck {
  const expected = BANNER_SPEC[slot]
  const got = readImageDimensions(buffer, mime)
  if (!got) {
    return {
      ok: false,
      expected,
      got: null,
      message: "Nao foi possivel ler as dimensoes da imagem",
    }
  }
  const tol = BANNER_SPEC.tolerancePx
  const ok =
    Math.abs(got.width - expected.width) <= tol &&
    Math.abs(got.height - expected.height) <= tol
  if (!ok) {
    return {
      ok: false,
      expected,
      got,
      message: `Imagem ${slot} precisa ter ${expected.width}x${expected.height}px (±${tol}px). Recebida ${got.width}x${got.height}px.`,
    }
  }
  return { ok: true, expected, got }
}

/**
 * Especificacao da capa de pacote. Diferente do banner (dimensao exata), aqui
 * exigimos apenas a PROPORCAO 16:9 (a mesma do card da vitrine), com uma
 * largura minima para evitar capas borradas. Tolerancia relativa no ratio
 * absorve arredondamentos (ex.: 1280x720, 1600x900, 1920x1080 sao aceitos).
 */
export const PACKAGE_COVER_SPEC = {
  aspectRatio: 16 / 9,
  aspectLabel: "16:9",
  recommended: { width: 1280, height: 720 },
  minWidth: 640,
  ratioTolerance: 0.04,
} as const

export function checkPackageCoverDimensions(
  buffer: ArrayBuffer | Buffer,
  mime: string,
): DimensionCheck {
  const expected = PACKAGE_COVER_SPEC.recommended
  const got = readImageDimensions(buffer, mime)
  if (!got) {
    return {
      ok: false,
      expected,
      got: null,
      message: "Nao foi possivel ler as dimensoes da imagem",
    }
  }
  if (got.width < PACKAGE_COVER_SPEC.minWidth) {
    return {
      ok: false,
      expected,
      got,
      message: `Imagem muito pequena. Use no mínimo ${PACKAGE_COVER_SPEC.minWidth}px de largura (recomendado ${expected.width}x${expected.height}px).`,
    }
  }
  const ratio = got.width / got.height
  const target = PACKAGE_COVER_SPEC.aspectRatio
  const within =
    Math.abs(ratio - target) / target <= PACKAGE_COVER_SPEC.ratioTolerance
  if (!within) {
    return {
      ok: false,
      expected,
      got,
      message: `A capa precisa ter proporção ${PACKAGE_COVER_SPEC.aspectLabel} (ex.: ${expected.width}x${expected.height}px). Recebida ${got.width}x${got.height}px.`,
    }
  }
  return { ok: true, expected, got }
}

/**
 * Especificacao das artes de divulgacao (banco de artes). Proporcao livre —
 * o admin sobe posts de feed, story, etc. Minimo evita artes borradas; o
 * maxSide e a guarda de memoria do canvas client-side que compoe a arte no
 * browser da revenda (4096x4096 RGBA ~ 64MB, dentro do teto do Safari iOS).
 */
export const ART_SPEC = {
  minWidth: 600,
  minHeight: 600,
  maxSide: 4096,
} as const

export function checkArtDimensions(
  buffer: ArrayBuffer | Buffer,
  mime: string,
): DimensionCheck {
  const expected = { width: ART_SPEC.minWidth, height: ART_SPEC.minHeight }
  const got = readImageDimensions(buffer, mime)
  if (!got) {
    return {
      ok: false,
      expected,
      got: null,
      message: "Nao foi possivel ler as dimensoes da imagem",
    }
  }
  if (got.width < ART_SPEC.minWidth || got.height < ART_SPEC.minHeight) {
    return {
      ok: false,
      expected,
      got,
      message: `Arte muito pequena. Use no mínimo ${ART_SPEC.minWidth}x${ART_SPEC.minHeight}px. Recebida ${got.width}x${got.height}px.`,
    }
  }
  if (got.width > ART_SPEC.maxSide || got.height > ART_SPEC.maxSide) {
    return {
      ok: false,
      expected,
      got,
      message: `Arte muito grande. O lado maior não pode passar de ${ART_SPEC.maxSide}px. Recebida ${got.width}x${got.height}px.`,
    }
  }
  return { ok: true, expected, got }
}
