/**
 * Padrões de chaves Redis para cache de tenant.
 */

export const TENANT_CACHE_TTL_SECONDS = 300 // 5 minutos

export function tenantBySlugKey(slug: string): string {
  return `tenant:slug:${slug}`
}

export function tenantByDomainKey(domain: string): string {
  return `tenant:domain:${domain}`
}

export function tenantByIdKey(id: string): string {
  return `tenant:id:${id}`
}

// Redirect de subdominio antigo -> slug atual, apos um rename. Valor = slug novo.
// TTL = janela de reserva (15 dias). Lido tambem no proxy/edge (src/proxy.ts).
export function tenantRedirectKey(oldSlug: string): string {
  return `tenant:redirect:${oldSlug}`
}

export const TENANT_REDIRECT_TTL_SECONDS = 15 * 24 * 60 * 60 // 15 dias
