import { isLmsConfigured } from "./config"
import { putLmsTenantBranding } from "./client"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"

/**
 * Registra (best-effort) a identidade da revenda no LMS
 * (PUT /api/v1/tenants/:id): nome, logo E as duas cores da vitrine.
 *
 * Sem isto o aluno da revenda vê a marca PMB (fallback) na plataforma de aulas —
 * e, desde a autoria de curso pela unidade, a PRÓPRIA revenda editaria o curso
 * dela dentro de uma casca com a marca da plataforma.
 *
 * As cores vão junto de propósito: identidade é logo + cor. Mandar só a logo
 * entrega a marca pela metade — o nome da unidade sobre o verde da PMB.
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
  /** Ausentes = a chamada não conhece as cores; o LMS PRESERVA o que já gravou. */
  primaryColor?: string | null
  secondaryColor?: string | null
}): Promise<void> {
  if (!isLmsConfigured()) return
  if (tenant.slug === PMB_TENANT_SLUG) return
  try {
    await putLmsTenantBranding(tenant.id, {
      brandName: tenant.name,
      logoUrl: tenant.logoUrl,
      // `undefined` (campo fora do JSON) preserva; `""` limpa. Por isso o
      // `?? undefined` e não `?? ""`: um caller que não carregou as cores não
      // pode apagar a personalização da unidade.
      primaryColor: tenant.primaryColor ?? undefined,
      secondaryColor: tenant.secondaryColor ?? undefined,
    })
  } catch (err) {
    contextLogger().warn(
      { err, event: "lms.branding.sync_failed", tenantId: tenant.id },
      "registro de branding da revenda no LMS falhou (best-effort)",
    )
  }
}
