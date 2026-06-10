import { z } from "zod"

/**
 * Pixels de rastreamento (marketing/analytics) configuráveis por revenda e pela
 * PMB (sistema mãe). Cada provedor guarda apenas um ID + flag `enabled`; nunca
 * HTML/script cru — os scripts são montados a partir de templates conhecidos em
 * src/lib/tracking/snippets.ts. Todos os IDs são validados por regex aqui (1ª
 * barreira) e sanitizados de novo na montagem do script (defesa em profundidade),
 * impedindo XSS persistente cross-tenant.
 *
 * Os pixels carregam automaticamente no acesso — o aviso de cookies
 * (CookieConsent) é apenas informativo, sem gate de consentimento.
 */

const enabledFlag = z.boolean().default(true)

export const trackingPixelsSchema = z
  .object({
    // Google Analytics 4 — Measurement ID (ex: G-XXXXXXX)
    ga4: z
      .object({
        enabled: enabledFlag,
        measurementId: z
          .string()
          .trim()
          .regex(/^G-[A-Z0-9]{4,20}$/i, "ID inválido (ex: G-XXXXXXX)"),
      })
      .optional(),

    // Google Ads — Conversion ID (AW-XXXXXXXXX) + label da conversão de compra
    googleAds: z
      .object({
        enabled: enabledFlag,
        conversionId: z
          .string()
          .trim()
          .regex(/^AW-[0-9]{6,15}$/i, "ID inválido (ex: AW-123456789)"),
        // Label da ação de conversão "compra" (parte após a barra em send_to).
        // Vazio = só carrega a tag (sem evento de compra).
        purchaseLabel: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{1,40}$/, "Label inválido")
          .optional()
          .or(z.literal("")),
      })
      .optional(),

    // Google Tag Manager — Container ID (GTM-XXXXXX)
    gtm: z
      .object({
        enabled: enabledFlag,
        containerId: z
          .string()
          .trim()
          .regex(/^GTM-[A-Z0-9]{4,12}$/i, "ID inválido (ex: GTM-XXXXXX)"),
      })
      .optional(),

    // Meta (Facebook/Instagram) Pixel — ID numérico
    metaPixel: z
      .object({
        enabled: enabledFlag,
        pixelId: z
          .string()
          .trim()
          .regex(/^[0-9]{5,20}$/, "ID inválido (apenas números)"),
      })
      .optional(),

    // TikTok Pixel — ID alfanumérico
    tiktok: z
      .object({
        enabled: enabledFlag,
        pixelId: z
          .string()
          .trim()
          .regex(/^[A-Z0-9]{8,40}$/i, "ID inválido"),
      })
      .optional(),

    // LinkedIn Insight Tag — Partner ID numérico
    linkedin: z
      .object({
        enabled: enabledFlag,
        partnerId: z
          .string()
          .trim()
          .regex(/^[0-9]{3,15}$/, "Partner ID inválido (apenas números)"),
      })
      .optional(),

    // Pinterest Tag — Tag ID numérico
    pinterest: z
      .object({
        enabled: enabledFlag,
        tagId: z
          .string()
          .trim()
          .regex(/^[0-9]{6,20}$/, "Tag ID inválido (apenas números)"),
      })
      .optional(),

    // Microsoft Advertising (Bing) — UET Tag ID numérico
    microsoftUet: z
      .object({
        enabled: enabledFlag,
        tagId: z
          .string()
          .trim()
          .regex(/^[0-9]{5,20}$/, "Tag ID inválido (apenas números)"),
      })
      .optional(),

    // Microsoft Clarity — Project ID alfanumérico (heatmap/gravação)
    clarity: z
      .object({
        enabled: enabledFlag,
        projectId: z
          .string()
          .trim()
          .regex(/^[a-z0-9]{6,20}$/i, "Project ID inválido"),
      })
      .optional(),

    // Hotjar — Site ID numérico (heatmap/gravação)
    hotjar: z
      .object({
        enabled: enabledFlag,
        siteId: z
          .string()
          .trim()
          .regex(/^[0-9]{5,12}$/, "Site ID inválido (apenas números)"),
      })
      .optional(),
  })
  .strict()

export type TrackingPixels = z.infer<typeof trackingPixelsSchema>
export type TrackingProviderKey = keyof TrackingPixels

/**
 * Faz o parse defensivo de um valor vindo do banco (Json) ou da API. Retorna um
 * objeto sempre válido — descarta o que não casar com o schema (ex: dado legado
 * ou corrompido) em vez de quebrar a renderização da vitrine.
 */
export function parseTrackingPixels(raw: unknown): TrackingPixels {
  if (!raw || typeof raw !== "object") return {}
  const result = trackingPixelsSchema.safeParse(raw)
  if (result.success) return result.data
  // Tenta um parse tolerante provedor a provedor (não derruba tudo por 1 ID ruim).
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const single = trackingPixelsSchema.safeParse({ [key]: value })
    if (single.success && single.data[key as TrackingProviderKey]) {
      out[key] = single.data[key as TrackingProviderKey]
    }
  }
  return out as TrackingPixels
}

/**
 * Normaliza o payload de um formulário: remove provedores cujo ID principal veio
 * vazio (= "limpar este provedor") antes de validar. Retorna o resultado do
 * safeParse strict para o caller tratar erros de campo.
 */
export function parseTrackingPixelsInput(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return trackingPixelsSchema.safeParse({})
  }
  const cleaned: Record<string, unknown> = {}
  for (const provider of TRACKING_PROVIDERS) {
    const value = (raw as Record<string, unknown>)[provider.key]
    if (!value || typeof value !== "object") continue
    const idValue = (value as Record<string, unknown>)[provider.idField]
    if (typeof idValue !== "string" || idValue.trim() === "") continue
    cleaned[provider.key] = value
  }
  return trackingPixelsSchema.safeParse(cleaned)
}

/** True se nenhum provedor habilitado existe na config (nada a renderizar). */
export function isTrackingEmpty(pixels: TrackingPixels | null | undefined): boolean {
  if (!pixels) return true
  return !Object.values(pixels).some((p) => p && p.enabled !== false)
}

// ---------------------------------------------------------------------------
// Metadados para renderização genérica dos formulários (painel + admin)
// ---------------------------------------------------------------------------

export type TrackingCategory = "analytics" | "ads" | "heatmap"

export interface TrackingFieldMeta {
  /** Nome do campo dentro do objeto do provedor (ex: "measurementId"). */
  key: string
  label: string
  placeholder: string
  optional?: boolean
}

export interface TrackingProviderMeta {
  key: TrackingProviderKey
  label: string
  category: TrackingCategory
  /** Campo de ID principal (vazio = provedor desativado). */
  idField: string
  fields: TrackingFieldMeta[]
  help: string
  /** Dispara evento de conversão de compra (Purchase)? */
  firesPurchase: boolean
}

export const TRACKING_PROVIDERS: TrackingProviderMeta[] = [
  {
    key: "ga4",
    label: "Google Analytics 4",
    category: "analytics",
    idField: "measurementId",
    fields: [
      { key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX" },
    ],
    help: "Admin GA4 → Administrador → Fluxos de dados → ID de métricas (G-…).",
    firesPurchase: true,
  },
  {
    key: "googleAds",
    label: "Google Ads",
    category: "ads",
    idField: "conversionId",
    fields: [
      { key: "conversionId", label: "ID de conversão", placeholder: "AW-123456789" },
      {
        key: "purchaseLabel",
        label: "Label da conversão de compra",
        placeholder: "AbCdEfGhIj",
        optional: true,
      },
    ],
    help: "Google Ads → Metas → Conversões. O ID é AW-…; o label é a parte após a barra em send_to.",
    firesPurchase: true,
  },
  {
    key: "gtm",
    label: "Google Tag Manager",
    category: "analytics",
    idField: "containerId",
    fields: [
      { key: "containerId", label: "Container ID", placeholder: "GTM-XXXXXX" },
    ],
    help: "Contêiner GTM que pode hospedar outras tags. ID no topo do workspace (GTM-…).",
    firesPurchase: false,
  },
  {
    key: "metaPixel",
    label: "Meta Pixel (Facebook/Instagram)",
    category: "ads",
    idField: "pixelId",
    fields: [{ key: "pixelId", label: "Pixel ID", placeholder: "123456789012345" }],
    help: "Gerenciador de Eventos da Meta → Fontes de dados → seu pixel (ID numérico).",
    firesPurchase: true,
  },
  {
    key: "tiktok",
    label: "TikTok Pixel",
    category: "ads",
    idField: "pixelId",
    fields: [{ key: "pixelId", label: "Pixel ID", placeholder: "C4XXXXXXXXXXXXXXXX" }],
    help: "TikTok Ads → Ativos → Eventos → Pixel da Web → ID do pixel.",
    firesPurchase: true,
  },
  {
    key: "linkedin",
    label: "LinkedIn Insight Tag",
    category: "ads",
    idField: "partnerId",
    fields: [{ key: "partnerId", label: "Partner ID", placeholder: "1234567" }],
    help: "LinkedIn Campaign Manager → Ativos de dados → Insight Tag → Partner ID.",
    firesPurchase: false,
  },
  {
    key: "pinterest",
    label: "Pinterest Tag",
    category: "ads",
    idField: "tagId",
    fields: [{ key: "tagId", label: "Tag ID", placeholder: "2612345678901" }],
    help: "Pinterest Ads → Conversões → Tag do Pinterest → ID da tag.",
    firesPurchase: true,
  },
  {
    key: "microsoftUet",
    label: "Microsoft Ads (Bing UET)",
    category: "ads",
    idField: "tagId",
    fields: [{ key: "tagId", label: "UET Tag ID", placeholder: "12345678" }],
    help: "Microsoft Advertising → Ferramentas → UET tag → ID da tag.",
    firesPurchase: true,
  },
  {
    key: "clarity",
    label: "Microsoft Clarity (heatmap)",
    category: "heatmap",
    idField: "projectId",
    fields: [{ key: "projectId", label: "Project ID", placeholder: "abcdef1234" }],
    help: "Clarity → Settings → Overview → Project ID.",
    firesPurchase: false,
  },
  {
    key: "hotjar",
    label: "Hotjar (heatmap)",
    category: "heatmap",
    idField: "siteId",
    fields: [{ key: "siteId", label: "Site ID", placeholder: "1234567" }],
    help: "Hotjar → Sites & organizations → Site ID.",
    firesPurchase: false,
  },
]
