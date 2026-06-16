import { prisma } from "@/lib/prisma"

/**
 * Conteúdo da seção/banner "EJA" da home.
 *
 * Espelha a lógica da Técnica, mas como banner (sem lista de cursos):
 * - **PMB (tenantId null):** banner, link e rótulo vêm de `SystemSettings.eja*`.
 * - **Vitrine de revendedor (tenantId):** a **imagem do banner** é padronizada
 *   pela PMB (`SystemSettings.ejaBannerImageUrl`), mas o **link de destino e o
 *   rótulo são do próprio revendedor** (`Tenant.ejaUrl/Label`, configurados pelo
 *   admin por unidade). Sem link configurado, a seção não tem destino e é
 *   omitida na renderização.
 *
 * **Ignora** os flags `ejaEnabled`: a exibição na home é controlada pelo
 * `enabled` do próprio `HomeSection` (kind="eja").
 */

export const EJA_DEFAULT_LABEL = "EJA — Ensino para Jovens e Adultos"

export interface EjaSectionContent {
  label: string
  url: string | null
  bannerImageUrl: string | null
}

export async function loadEjaSectionContent(
  tenantId: string | null,
): Promise<EjaSectionContent> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { ejaUrl: true, ejaLabel: true, ejaBannerImageUrl: true },
    })
    // Imagem do banner é sempre a padronizada pela PMB (herdada pela rede).
    const bannerImageUrl = settings?.ejaBannerImageUrl?.trim() || null

    if (!tenantId) {
      const url = settings?.ejaUrl?.trim() || null
      const label = settings?.ejaLabel?.trim() || EJA_DEFAULT_LABEL
      return { label, url, bannerImageUrl }
    }

    // Vitrine de revendedor: imagem da PMB + link/rótulo da unidade.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ejaUrl: true, ejaLabel: true },
    })
    const url = tenant?.ejaUrl?.trim() || null
    const label = tenant?.ejaLabel?.trim() || EJA_DEFAULT_LABEL
    return { label, url, bannerImageUrl }
  } catch {
    return { label: EJA_DEFAULT_LABEL, url: null, bannerImageUrl: null }
  }
}

export interface PmbEjaConfig {
  enabled: boolean
  url: string | null
  label: string | null
  bannerImageUrl: string | null
}

/** Config completa do EJA do site PMB — usada pelo editor do admin. */
export async function loadPmbEjaConfig(): Promise<PmbEjaConfig> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        ejaEnabled: true,
        ejaUrl: true,
        ejaLabel: true,
        ejaBannerImageUrl: true,
      },
    })
    return {
      enabled: settings?.ejaEnabled ?? false,
      url: settings?.ejaUrl ?? null,
      label: settings?.ejaLabel ?? null,
      bannerImageUrl: settings?.ejaBannerImageUrl ?? null,
    }
  } catch {
    return { enabled: false, url: null, label: null, bannerImageUrl: null }
  }
}
