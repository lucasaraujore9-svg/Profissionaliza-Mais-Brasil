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

export type SocialKind = "instagram" | "facebook" | "youtube" | "tiktok"

// ---------------------------------------------------------------------------
// Layout posicionavel por arte/variante (definido pelo designer no upload;
// a revenda pode ajustar no download — ajustes nao persistem).
// Ancoras no CENTRO (cx/cy relativos 0..1): arrastar/redimensionar mantem o
// elemento estavel e o espelhamento do legado vira so trocar cx por 1-cx.
// ---------------------------------------------------------------------------

export interface LogoPlacement {
  cx: number // 0..1 (fracao da largura da arte)
  cy: number // 0..1 (fracao da altura)
  w: number // largura relativa da CAIXA de contain do logo
  h: number // altura relativa da caixa (slider escala w/h uniformemente)
  bg: boolean // quadrado branco atras do logo
}

export interface PricePlacement {
  cx: number
  cy: number
  // Multiplicador sobre o tamanho-base do pill (a largura real depende do
  // texto digitado pela revenda, que o designer nao conhece).
  scale: number
}

export interface VariantLayout {
  logo: LogoPlacement
  price?: PricePlacement // presente quando a arte tem hasPrice
  footerBg: boolean // fundo branco do rodape (posicao do rodape e FIXA)
  // Cor do texto/icones do rodape (hex #rrggbb). Ausente = automatica:
  // textOnWhite(primaryColor) com fundo, branco com sombra sem fundo.
  footerColor?: string
}

export interface ArtLayout {
  feed: VariantLayout
  story?: VariantLayout
}

export interface ArtItem {
  id: string
  title: string
  category: string | null
  feed: ArtVariant
  story: ArtVariant | null
  hasPrice: boolean
  logoCorner: LogoCorner
  layout: ArtLayout | null
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
  // Primeira rede social disponivel: kind escolhe o icone do rodape.
  social: { kind: SocialKind; handle: string } | null
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

// Caixas RESERVADAS no template das artes (medidas das artes de referencia
// 2026-07-16): retangulos brancos arredondados ja desenhados na arte onde o
// sistema encaixa o logo (topo) e os contatos (rodape). Valores relativos
// (fracao da largura/altura). O template de stories tem rodape mais alto.
export interface TemplateBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ArtAnchors {
  logoBox: TemplateBox // posicao para logoCorner = "top-right" (espelhar p/ left)
  footerBox: TemplateBox
}

export const ART_ANCHORS: Record<ArtVariantKind, ArtAnchors> = {
  feed: {
    logoBox: { x: 0.695, y: 0.028, w: 0.279, h: 0.111 },
    footerBox: { x: 0.031, y: 0.919, w: 0.938, h: 0.075 },
  },
  story: {
    logoBox: { x: 0.669, y: 0.027, w: 0.293, h: 0.086 },
    footerBox: { x: 0.047, y: 0.84, w: 0.904, h: 0.151 },
  },
}

// Mesma fronteira usada na validacao de upload (checkArtVariantDimensions).
export function anchorsFor(width: number, height: number): ArtAnchors {
  return height / width >= 1.4 ? ART_ANCHORS.story : ART_ANCHORS.feed
}

// Espelha a caixa do logo para o canto superior ESQUERDO (margens simetricas).
export function mirrorBoxLeft(box: TemplateBox): TemplateBox {
  return { ...box, x: 1 - (box.x + box.w) }
}

// Cor de texto legivel SOBRE BRANCO (caixas do template): usa a cor da unidade
// quando ela e escura o bastante; senao cai num azul-marinho neutro.
export function textOnWhite(hex: string): string {
  const value = hex.trim().replace(/^#/, "")
  const expand = /^[0-9a-f]{3}$/i.test(value)
    ? value.split("").map((c) => c + c).join("")
    : value
  if (!/^[0-9a-f]{6}$/i.test(expand)) return "#1e293b"
  const r = parseInt(expand.slice(0, 2), 16)
  const g = parseInt(expand.slice(2, 4), 16)
  const b = parseInt(expand.slice(4, 6), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance < 0.45 ? `#${expand.toLowerCase()}` : "#1e293b"
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

// ---------------------------------------------------------------------------
// Defaults e resolucao de layout
// ---------------------------------------------------------------------------

// Mantem o placement dentro do canvas: o logo nao pode vazar (centro limitado
// pela meia-caixa); o preco so precisa do centro dentro da area util.
export function clampLogoPlacement(p: LogoPlacement): LogoPlacement {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v))
  const w = clamp(p.w, 0.04, 0.9)
  const h = clamp(p.h, 0.02, 0.9)
  return {
    ...p,
    w,
    h,
    cx: clamp(p.cx, w / 2, 1 - w / 2),
    cy: clamp(p.cy, h / 2, 1 - h / 2),
  }
}

export function clampPricePlacement(p: PricePlacement): PricePlacement {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v))
  return {
    ...p,
    scale: clamp(p.scale, 0.5, 2.5),
    cx: clamp(p.cx, 0.03, 0.97),
    cy: clamp(p.cy, 0.03, 0.97),
  }
}

// Layout default por variante — deriva das ancoras do template legado, entao
// artes antigas (layout null) rendem exatamente como antes. Fundos:
// - logo.bg=false: artes legadas ja TEM a caixa branca pintada no arquivo; o
//   bg do sistema (colado no logo contido) criaria dupla borda.
// - footerBg=true: com bg desligado o rodape usa texto branco com sombra, que
//   sobre a caixa branca PINTADA das artes legadas ficaria ilegivel; o
//   roundRect do sistema cai exatamente sobre a caixa pintada (inocuo) e a
//   tinta continua textOnWhite(primaryColor).
export function defaultVariantLayout(
  kind: ArtVariantKind,
  logoCorner: LogoCorner,
  hasPrice: boolean,
): VariantLayout {
  const anchors = ART_ANCHORS[kind]
  const box = logoCorner === "top-left" ? mirrorBoxLeft(anchors.logoBox) : anchors.logoBox
  return {
    logo: {
      cx: box.x + box.w / 2,
      cy: box.y + box.h / 2,
      w: box.w,
      h: box.h,
      bg: false,
    },
    ...(hasPrice
      ? {
          price:
            kind === "feed"
              ? { cx: 0.8, cy: 0.855, scale: 1 }
              : { cx: 0.78, cy: 0.775, scale: 1 },
        }
      : {}),
    footerBg: true,
  }
}

// Layout efetivo de uma variante: o salvo pelo designer (com clamp defensivo e
// price garantido quando hasPrice) ou o default legado.
export function resolveVariantLayout(art: ArtItem, kind: ArtVariantKind): VariantLayout {
  const saved = art.layout?.[kind]
  const fallback = defaultVariantLayout(kind, art.logoCorner, art.hasPrice)
  if (!saved) return fallback
  return {
    logo: clampLogoPlacement(saved.logo),
    ...(art.hasPrice
      ? { price: clampPricePlacement(saved.price ?? fallback.price!) }
      : {}),
    footerBg: saved.footerBg,
    ...(saved.footerColor ? { footerColor: saved.footerColor } : {}),
  }
}

// Grupos do rodape na ordem site -> whatsapp -> rede (omite ausentes).
export interface FooterGroup {
  icon: "globe" | "whatsapp" | SocialKind
  text: string
}

export function footerGroups(tenant: TenantBrand): FooterGroup[] {
  const groups: FooterGroup[] = [{ icon: "globe", text: tenant.siteHost }]
  if (tenant.whatsapp) groups.push({ icon: "whatsapp", text: tenant.whatsapp })
  if (tenant.social) groups.push({ icon: tenant.social.kind, text: tenant.social.handle })
  return groups
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
