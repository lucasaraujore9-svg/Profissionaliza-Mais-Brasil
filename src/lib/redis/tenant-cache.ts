import {
  getJson,
  setJson,
  invalidateMany,
  TENANT_CACHE_TTL_SECONDS,
} from "./cache"
import { tenantBySlugKey, tenantByDomainKey, tenantByIdKey } from "./keys"

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
