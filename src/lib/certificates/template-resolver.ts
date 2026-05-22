import type { CertificateLayout, CertificateTemplate } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Snapshot serializado de um template (sem ids/datas). E o que vai em
 * Certificate.templateSnapshot para preservar a aparencia ao re-gerar PDF.
 */
export interface ResolvedTemplate {
  layout: CertificateLayout
  backgroundUrl: string | null
  logoUrl: string | null
  sealUrl: string | null
  signatureUrl: string | null
  primaryColor: string
  secondaryColor: string
  titleText: string
  bodyText: string
  footerText: string | null
  signerName: string | null
  signerTitle: string | null
  showQrCode: boolean
  showValidationUrl: boolean
  showSeal: boolean
}

const DEFAULT_PRIMARY = "#16653f" // PMB green-700
const DEFAULT_SECONDARY = "#0f3d24" // PMB green-900

export const DEFAULT_TEMPLATE: ResolvedTemplate = {
  layout: "CLASSIC",
  backgroundUrl: null,
  logoUrl: null,
  sealUrl: null,
  signatureUrl: null,
  primaryColor: DEFAULT_PRIMARY,
  secondaryColor: DEFAULT_SECONDARY,
  titleText: "CERTIFICADO DE CONCLUSAO",
  bodyText:
    "Certificamos que {nome} concluiu com aproveitamento o curso de {curso}, com carga horaria de {carga_horaria}, em {data_conclusao}.",
  footerText: null,
  signerName: null,
  signerTitle: null,
  showQrCode: true,
  showValidationUrl: true,
  showSeal: false,
}

function fromPrisma(t: CertificateTemplate, fallbackPrimary?: string | null, fallbackSecondary?: string | null): ResolvedTemplate {
  return {
    layout: t.layout,
    backgroundUrl: t.backgroundUrl ?? null,
    logoUrl: t.logoUrl ?? null,
    sealUrl: t.sealUrl ?? null,
    signatureUrl: t.signatureUrl ?? null,
    primaryColor: t.primaryColor ?? fallbackPrimary ?? DEFAULT_PRIMARY,
    secondaryColor: t.secondaryColor ?? fallbackSecondary ?? DEFAULT_SECONDARY,
    titleText: t.titleText,
    bodyText: t.bodyText,
    footerText: t.footerText ?? null,
    signerName: t.signerName ?? null,
    signerTitle: t.signerTitle ?? null,
    showQrCode: t.showQrCode,
    showValidationUrl: t.showValidationUrl,
    showSeal: t.showSeal,
  }
}

/**
 * Resolve template ativo para um certificado.
 * Ordem: tenant.certificateTemplate (se ativo) -> template global (tenantId=null) -> defaults.
 */
export async function resolveCertificateTemplate(
  tenantId: string | null,
): Promise<ResolvedTemplate> {
  // Se ha tenant, tenta template do tenant primeiro (e cores do tenant como fallback de cor)
  if (tenantId) {
    const [tenantTemplate, tenant] = await Promise.all([
      prisma.certificateTemplate.findUnique({ where: { tenantId } }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { primaryColor: true, secondaryColor: true, logoUrl: true },
      }),
    ])
    if (tenantTemplate && tenantTemplate.isActive) {
      const resolved = fromPrisma(
        tenantTemplate,
        tenant?.primaryColor,
        tenant?.secondaryColor,
      )
      // Se template nao define logo proprio, usa logo do tenant como fallback
      if (!resolved.logoUrl && tenant?.logoUrl) {
        resolved.logoUrl = tenant.logoUrl
      }
      return resolved
    }
  }

  // Template global PMB
  const global = await prisma.certificateTemplate.findFirst({
    where: { tenantId: null, isActive: true },
  })
  if (global) return fromPrisma(global)

  return { ...DEFAULT_TEMPLATE }
}

/**
 * Converte o snapshot (Prisma Json) de volta em ResolvedTemplate tipado.
 */
export function readSnapshot(snapshot: unknown): ResolvedTemplate {
  const base = { ...DEFAULT_TEMPLATE }
  if (!snapshot || typeof snapshot !== "object") return base
  const s = snapshot as Record<string, unknown>
  const layout = s.layout
  if (layout === "CLASSIC" || layout === "MODERN" || layout === "MINIMAL") {
    base.layout = layout
  }
  if (typeof s.backgroundUrl === "string" || s.backgroundUrl === null) base.backgroundUrl = (s.backgroundUrl as string | null) ?? null
  if (typeof s.logoUrl === "string" || s.logoUrl === null) base.logoUrl = (s.logoUrl as string | null) ?? null
  if (typeof s.sealUrl === "string" || s.sealUrl === null) base.sealUrl = (s.sealUrl as string | null) ?? null
  if (typeof s.signatureUrl === "string" || s.signatureUrl === null) base.signatureUrl = (s.signatureUrl as string | null) ?? null
  if (typeof s.primaryColor === "string") base.primaryColor = s.primaryColor
  if (typeof s.secondaryColor === "string") base.secondaryColor = s.secondaryColor
  if (typeof s.titleText === "string") base.titleText = s.titleText
  if (typeof s.bodyText === "string") base.bodyText = s.bodyText
  if (typeof s.footerText === "string" || s.footerText === null) base.footerText = (s.footerText as string | null) ?? null
  if (typeof s.signerName === "string" || s.signerName === null) base.signerName = (s.signerName as string | null) ?? null
  if (typeof s.signerTitle === "string" || s.signerTitle === null) base.signerTitle = (s.signerTitle as string | null) ?? null
  if (typeof s.showQrCode === "boolean") base.showQrCode = s.showQrCode
  if (typeof s.showValidationUrl === "boolean") base.showValidationUrl = s.showValidationUrl
  if (typeof s.showSeal === "boolean") base.showSeal = s.showSeal
  return base
}
