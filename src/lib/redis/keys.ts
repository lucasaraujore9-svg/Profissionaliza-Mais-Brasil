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
