import { getJson, setJson, invalidate, invalidateMany } from "./cache"
import {
  TENANT_CACHE_TTL_SECONDS,
  TENANT_REDIRECT_TTL_SECONDS,
  tenantBySlugKey,
  tenantByDomainKey,
  tenantByIdKey,
  tenantRedirectKey,
} from "./keys"

export interface CachedTenant {
  id: string
  slug: string
  status: string
  customDomain?: string | null
}

export async function getTenantBySlug(
  slug: string,
): Promise<CachedTenant | null> {
  return getJson<CachedTenant>(tenantBySlugKey(slug))
}

export async function getTenantByDomain(
  domain: string,
): Promise<CachedTenant | null> {
  return getJson<CachedTenant>(tenantByDomainKey(domain))
}

export async function setTenant(
  tenant: CachedTenant,
  ttlSeconds: number = TENANT_CACHE_TTL_SECONDS,
): Promise<void> {
  const tasks: Promise<void>[] = [
    setJson(tenantBySlugKey(tenant.slug), tenant, ttlSeconds),
    setJson(tenantByIdKey(tenant.id), tenant, ttlSeconds),
  ]
  if (tenant.customDomain) {
    tasks.push(setJson(tenantByDomainKey(tenant.customDomain), tenant, ttlSeconds))
  }
  await Promise.all(tasks)
}

export async function invalidateTenant(
  tenant: Pick<CachedTenant, "id" | "slug" | "customDomain">,
): Promise<void> {
  const keys = [
    tenantBySlugKey(tenant.slug),
    tenantByIdKey(tenant.id),
  ]
  if (tenant.customDomain) {
    keys.push(tenantByDomainKey(tenant.customDomain))
  }
  await invalidateMany(keys)
}

/**
 * Grava o redirect de um subdominio antigo -> slug atual da unidade (apos um
 * rename). TTL = janela de reserva (15 dias). O proxy/edge le essa chave para
 * emitir 308 do subdominio antigo para o novo.
 */
export async function setSlugRedirect(
  oldSlug: string,
  newSlug: string,
  ttlSeconds: number = TENANT_REDIRECT_TTL_SECONDS,
): Promise<void> {
  await setJson(tenantRedirectKey(oldSlug), newSlug, ttlSeconds)
}

/** Remove um redirect de subdominio (ex.: quando a unidade reivindica o slug de volta). */
export async function invalidateSlugRedirect(oldSlug: string): Promise<void> {
  await invalidate(tenantRedirectKey(oldSlug))
}
