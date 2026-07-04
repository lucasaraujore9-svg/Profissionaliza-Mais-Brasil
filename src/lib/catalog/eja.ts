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
  bannerImageUrlMobile: string | null
}

export async function loadEjaSectionContent(
  tenantId: string | null,
): Promise<EjaSectionContent> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        ejaUrl: true,
        ejaLabel: true,
        ejaBannerImageUrl: true,
        ejaBannerImageUrlMobile: true,
      },
    })
    // Imagens do banner são sempre as padronizadas pela PMB (herdadas pela rede).
    const bannerImageUrl = settings?.ejaBannerImageUrl?.trim() || null
    const bannerImageUrlMobile =
      settings?.ejaBannerImageUrlMobile?.trim() || null

    if (!tenantId) {
      const url = settings?.ejaUrl?.trim() || null
      const label = settings?.ejaLabel?.trim() || EJA_DEFAULT_LABEL
      return { label, url, bannerImageUrl, bannerImageUrlMobile }
    }

    // Vitrine de revendedor: imagem da PMB + link/rótulo da unidade.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ejaUrl: true, ejaLabel: true },
    })
    const url = tenant?.ejaUrl?.trim() || null
    const label = tenant?.ejaLabel?.trim() || EJA_DEFAULT_LABEL
    return { label, url, bannerImageUrl, bannerImageUrlMobile }
  } catch {
    return {
      label: EJA_DEFAULT_LABEL,
      url: null,
      bannerImageUrl: null,
      bannerImageUrlMobile: null,
    }
  }
}

