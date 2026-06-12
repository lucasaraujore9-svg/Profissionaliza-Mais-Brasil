// Carregamento da identidade de marca de uma unidade a partir do banco.
// Separado de `./brand` porque importa Prisma (server-only) — `./brand` precisa
// ficar livre de Prisma para rodar nos previews de template.

import { prisma } from "@/lib/prisma"
import {
  PMB_EMAIL_BRAND,
  tenantEmailBrand,
  type EmailBrand,
} from "./brand"

/**
 * Busca os campos de marca da unidade e monta o `EmailBrand`. Tenant inexistente
 * (ou id ausente) cai na marca institucional PMB como salvaguarda.
 */
export async function loadTenantEmailBrand(
  tenantId: string | null | undefined,
): Promise<EmailBrand> {
  if (!tenantId) return PMB_EMAIL_BRAND
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      slug: true,
      name: true,
      logoUrl: true,
      customDomain: true,
      supportEmail: true,
    },
  })
  return tenant ? tenantEmailBrand(tenant) : PMB_EMAIL_BRAND
}

/** Igual a `loadTenantEmailBrand`, mas resolvendo a unidade pelo `slug`. */
export async function loadTenantEmailBrandBySlug(
  slug: string | null | undefined,
): Promise<EmailBrand> {
  if (!slug) return PMB_EMAIL_BRAND
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      logoUrl: true,
      customDomain: true,
      supportEmail: true,
    },
  })
  return tenant ? tenantEmailBrand(tenant) : PMB_EMAIL_BRAND
}
