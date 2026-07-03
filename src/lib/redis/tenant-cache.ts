import { getJson, setJson, invalidate, invalidateMany } from "./cache"
import {
  TENANT_CACHE_TTL_SECONDS,
  TENANT_REDIRECT_TTL_SECONDS,
  tenantBySlugKey,
  tenantByDomainKey,
  tenantByIdKey,
  tenantBrandingKey,
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
    // PERF-001: limpa tambem o branding cacheado (todo caller de invalidateTenant
    // — vitrine/banner/dominio/billing/status/eja/tecnica/automacao — ja passa por
    // aqui, entao a edicao reflete no proximo request).
    tenantBrandingKey(tenant.id),
  ]
  if (tenant.customDomain) {
    keys.push(tenantByDomainKey(tenant.customDomain))
  }
  await invalidateMany(keys)
}

// ── PERF-001: cache do payload de branding usado pelo layout da vitrine ──────

/** Lê o branding cacheado do tenant por id (`null` em miss ou Redis off). */
export async function getTenantBranding<T>(id: string): Promise<T | null> {
  return getJson<T>(tenantBrandingKey(id))
}

/** Grava o branding do tenant (TTL 300s). Best-effort (fail-open no helper). */
export async function setTenantBranding<T>(
  id: string,
  value: T,
  ttlSeconds: number = TENANT_CACHE_TTL_SECONDS,
): Promise<void> {
  await setJson(tenantBrandingKey(id), value, ttlSeconds)
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
