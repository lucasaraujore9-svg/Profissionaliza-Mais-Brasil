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
  /**
   * Logo do Grupo Bolsa Mais Brasil (selo "powered by") — aparece como
   * rodape em TODOS os certificados, tanto da vitrine PMB quanto das
   * unidades/revendedores. Carregado de SystemSettings.groupLogoUrl.
   */
  groupLogoUrl: string | null
  /**
   * Nome do grupo exibido junto ao selo de plataforma. Carregado de
   * SystemSettings.groupName (default "Grupo Bolsa Mais Brasil").
   */
  groupName: string
}

const DEFAULT_PRIMARY = "#16653f" // PMB green-700
const DEFAULT_SECONDARY = "#0f3d24" // PMB green-900
const DEFAULT_GROUP_NAME = "Grupo Bolsa Mais Brasil"

export const DEFAULT_TEMPLATE: ResolvedTemplate = {
  layout: "CLASSIC",
  backgroundUrl: null,
  logoUrl: null,
  sealUrl: null,
  signatureUrl: null,
  primaryColor: DEFAULT_PRIMARY,
  secondaryColor: DEFAULT_SECONDARY,
  titleText: "CERTIFICADO DE CONCLUSÃO",
  bodyText:
    "Certificamos que {nome} concluiu com aproveitamento o curso de {curso}, com carga horária de {carga_horaria}, em {data_conclusao}.",
  footerText: null,
  signerName: null,
  signerTitle: null,
  showQrCode: true,
  showValidationUrl: true,
  showSeal: false,
  groupLogoUrl: null,
  groupName: DEFAULT_GROUP_NAME,
}

/**
 * Carrega as configuracoes globais do grupo (logo + nome) do SystemSettings.
 * Em caso de erro/registro ausente, retorna defaults seguros.
 */
async function loadGroupBranding(): Promise<{
  groupLogoUrl: string | null
  groupName: string
}> {
  try {
    const row = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { groupLogoUrl: true, groupName: true },
    })
    return {
      groupLogoUrl: row?.groupLogoUrl ?? null,
      groupName: row?.groupName?.trim() || DEFAULT_GROUP_NAME,
    }
  } catch {
    return { groupLogoUrl: null, groupName: DEFAULT_GROUP_NAME }
  }
}

function fromPrisma(
  t: CertificateTemplate,
  groupLogoUrl: string | null,
  groupName: string,
  fallbackPrimary?: string | null,
  fallbackSecondary?: string | null,
): ResolvedTemplate {
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
    groupLogoUrl,
    groupName,
  }
}

/**
 * Resolve template ativo para um certificado.
 *
 * Regras:
 * - Unidade (tenantId != null): herda TODO o design do template global do PMB
 *   (cores, textos, assinatura, selo, fundo, toggles). A unica diferenca e a
 *   `logoUrl` (lida de `tenant.logoUrl`) e o `layout` (escolhido pelo revendedor).
 *   O branding do grupo e identico ao do PMB.
 * - PMB (tenantId === null): le o template global (editado pelo SUPER_ADMIN).
 *   Cai pro DEFAULT_TEMPLATE se nao houver registro.
 */
export async function resolveCertificateTemplate(
  tenantId: string | null,
): Promise<ResolvedTemplate> {
  // Unidade — herda o design do sistema-mae (template global PMB), trocando
  // apenas a logo (logo da unidade) e o layout (escolha do revendedor).
  if (tenantId) {
    const [tenant, tenantTemplate, pmbGlobal, branding] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { logoUrl: true },
      }),
      prisma.certificateTemplate.findUnique({
        where: { tenantId },
        select: { layout: true },
      }),
      prisma.certificateTemplate.findFirst({
        where: { tenantId: null, isActive: true },
      }),
      loadGroupBranding(),
    ])

    // Base = design do sistema-mae; cai pro DEFAULT_TEMPLATE se ainda nao
    // houver template global configurado.
    const base: ResolvedTemplate = pmbGlobal
      ? fromPrisma(pmbGlobal, branding.groupLogoUrl, branding.groupName)
      : {
          ...DEFAULT_TEMPLATE,
          groupLogoUrl: branding.groupLogoUrl,
          groupName: branding.groupName,
        }

    return {
      ...base,
      layout: tenantTemplate?.layout ?? base.layout,
      logoUrl: tenant?.logoUrl ?? null,
    }
  }

  // PMB — template global (tenantId=null)
  const [global, branding] = await Promise.all([
    prisma.certificateTemplate.findFirst({
      where: { tenantId: null, isActive: true },
    }),
    loadGroupBranding(),
  ])
  if (global) {
    return fromPrisma(global, branding.groupLogoUrl, branding.groupName)
  }

  return {
    ...DEFAULT_TEMPLATE,
    groupLogoUrl: branding.groupLogoUrl,
    groupName: branding.groupName,
  }
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
  if (typeof s.groupLogoUrl === "string" || s.groupLogoUrl === null) {
    base.groupLogoUrl = (s.groupLogoUrl as string | null) ?? null
  }
  if (typeof s.groupName === "string" && s.groupName.trim()) {
    base.groupName = s.groupName
  }
  return base
}

/**
 * Re-aplica o branding do grupo (logo + nome) atualizado de SystemSettings
 * em um snapshot ja resolvido. Util quando o admin troca a logo do grupo —
 * certificados existentes regerados devem mostrar a nova logo, mesmo que o
 * snapshot original tenha sido salvo com a logo antiga (ou sem logo).
 */
export async function refreshGroupBranding(
  template: ResolvedTemplate,
): Promise<ResolvedTemplate> {
  const branding = await loadGroupBranding()
  return {
    ...template,
    groupLogoUrl: branding.groupLogoUrl,
    groupName: branding.groupName,
  }
}
