import { isLmsConfigured } from "./config"
import { putLmsTenantBranding } from "./client"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"

/**
 * Registra (best-effort) o branding white-label da revenda no LMS
 * (PUT /api/v1/tenants/:id). Sem isto, o aluno da revenda vê a marca PMB
 * (fallback) na plataforma de aulas.
 *
 * No-op quando:
 *  - o LMS não está configurado (LMS_API_URL/KEY ausentes) — não quebra fluxos
 *    que rodam para QUALQUER revenda (criar/editar), independente de provider;
 *  - é a vitrine PMB (`__pmb__`), que nunca leva branding de revenda.
 *
 * NUNCA lança — o branding não pode derrubar a criação/edição de revenda.
 * A chave (`tenant.id`) é a MESMA enviada nas matrículas e no SSO.
 */
export async function syncTenantBrandingToLms(tenant: {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}): Promise<void> {
  if (!isLmsConfigured()) return
  if (tenant.slug === PMB_TENANT_SLUG) return
  try {
    await putLmsTenantBranding(tenant.id, {
      brandName: tenant.name,
      logoUrl: tenant.logoUrl,
    })
  } catch (err) {
    contextLogger().warn(
      { err, event: "lms.branding.sync_failed", tenantId: tenant.id },
      "registro de branding da revenda no LMS falhou (best-effort)",
    )
  }
}
