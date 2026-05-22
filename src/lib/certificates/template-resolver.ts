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

/**
 * Defaults aplicados a TODAS as unidades (tenants).
 * Unidades nao customizam textos/cores/uploads — apenas escolhem o layout.
 * Logo e puxada automaticamente de `tenant.logoUrl`.
 */
const UNIT_DEFAULTS: Omit<ResolvedTemplate, "layout" | "logoUrl"> = {
  primaryColor: DEFAULT_PRIMARY,
  secondaryColor: DEFAULT_SECONDARY,
  titleText: "CERTIFICADO DE CONCLUSAO",
  bodyText:
    "Certificamos que {nome} concluiu com aproveitamento o curso de {curso}, com carga horaria de {carga_horaria}, em {data_conclusao}.",
  footerText: null,
  signerName: null,
  signerTitle: null,
  signatureUrl: null,
  sealUrl: null,
  backgroundUrl: null,
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
 *
 * Regras:
 * - Unidade (tenantId != null): usa UNIT_DEFAULTS para textos/cores/uploads
 *   e puxa apenas o `layout` do CertificateTemplate do tenant. A logo e
 *   automaticamente lida de `tenant.logoUrl` — unidades nao fazem upload.
 * - PMB (tenantId === null): le o template global (editado pelo SUPER_ADMIN).
 *   Cai pro DEFAULT_TEMPLATE se nao houver registro.
 */
export async function resolveCertificateTemplate(
  tenantId: string | null,
): Promise<ResolvedTemplate> {
  // Unidade — defaults fixos + layout escolhido pelo revendedor + logo do tenant
  if (tenantId) {
    const [tenant, tenantTemplate] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { logoUrl: true },
      }),
      prisma.certificateTemplate.findUnique({
        where: { tenantId },
        select: { layout: true },
      }),
    ])
    return {
      ...UNIT_DEFAULTS,
      layout: tenantTemplate?.layout ?? "CLASSIC",
      logoUrl: tenant?.logoUrl ?? null,
    }
  }

  // PMB — template global (tenantId=null)
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
