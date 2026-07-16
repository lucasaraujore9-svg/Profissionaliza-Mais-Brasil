// Tipos e helpers PUROS do banco de artes (sem DOM — a composicao canvas fica
// em compose.ts). Compartilhados entre o Server Component do painel (que monta
// as projecoes) e os client components (que compoem/baixam).

export type LogoCorner = "top-left" | "top-right"

// Uma variante de formato da arte (feed = quadrada/4:5, story = 9:16).
export interface ArtVariant {
  url: string // URL publica do arquivo base no bucket vitrine-assets
  width: number
  height: number
}

export type ArtVariantKind = "feed" | "story"

export const VARIANT_LABEL: Record<ArtVariantKind, string> = {
  feed: "Feed",
  story: "Stories",
}

// Sufixo no nome do arquivo baixado (feed/stories).
export const VARIANT_FILE_SUFFIX: Record<ArtVariantKind, string> = {
  feed: "feed",
  story: "stories",
}

export interface ArtItem {
  id: string
  title: string
  category: string | null
  feed: ArtVariant
  story: ArtVariant | null
  hasPrice: boolean
  logoCorner: LogoCorner
}

export interface TenantBrand {
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  // Host canonico da vitrine: dominio proprio verificado ou subdominio oficial.
  siteHost: string
  whatsapp: string | null
  // Primeira rede social disponivel, normalizada para "@handle" (ou null).
  social: string | null
}

// Normaliza um valor de rede social (URL colada, @handle ou handle puro) para
// "@handle". Retorna null quando nao sobra nada util.
export function normalizeSocialHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = raw.trim()
  if (!value) return null

  // Remove protocolo e www
  value = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "")
  // Remove dominios conhecidos (instagram.com/, facebook.com/, youtube.com/, tiktok.com/, fb.com/)
  value = value.replace(/^(instagram\.com|facebook\.com|fb\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com)\//i, "")
  // Descarta query/fragment e barras finais
  value = value.split(/[?#]/)[0].replace(/\/+$/, "")
  // Fica com o ultimo segmento do path (ex: "canal/videos" -> "videos" nao é o
  // que queremos; na pratica handles vem como primeiro e unico segmento, mas
  // perfis colados como ".../@handle" tem o handle no ultimo segmento)
  const segments = value.split("/").filter(Boolean)
  if (segments.length === 0) return null
  const last = segments[segments.length - 1]
  const handle = last.replace(/^@+/, "").trim()
  if (!handle) return null
  return `@${handle}`
}

// Cor de texto legivel sobre um fundo hex (#rgb ou #rrggbb) via luminancia
// relativa. Fundo claro -> texto escuro; fundo escuro/invalido -> branco.
export function contrastTextColor(hex: string): string {
  const value = hex.trim().replace(/^#/, "")
  let r: number, g: number, b: number
  if (/^[0-9a-f]{3}$/i.test(value)) {
    r = parseInt(value[0] + value[0], 16)
    g = parseInt(value[1] + value[1], 16)
    b = parseInt(value[2] + value[2], 16)
  } else if (/^[0-9a-f]{6}$/i.test(value)) {
    r = parseInt(value.slice(0, 2), 16)
    g = parseInt(value.slice(2, 4), 16)
    b = parseInt(value.slice(4, 6), 16)
  } else {
    return "#ffffff"
  }
  // Luminancia relativa (WCAG, aproximacao sRGB linearizada)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.5 ? "#111827" : "#ffffff"
}

// Formata centavos como moeda BRL (ex: 19990 -> "R$ 199,90").
export function formatPriceBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

// Nome de arquivo seguro para o download: "titulo-da-arte" sem acentos/simbolos.
export function slugifyFilename(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "arte"
  )
}
