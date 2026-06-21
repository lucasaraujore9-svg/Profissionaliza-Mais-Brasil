import "server-only"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"

/**
 * Invalida o cache Redis de um tenant (chaves slug/id/domain) após mudança de
 * status/slug/customDomain (PERF-001). Lê slug+customDomain do banco para apagar
 * todas as chaves. Best-effort (fail-open): se o Redis cair, o TTL curto (60s)
 * do cache cobre a staleness, e o checkout revalida status no servidor de toda
 * forma — esta invalidação só deixa a página de vitrine refletir o status na hora.
 */
export async function invalidateTenantCache(id: string): Promise<void> {
  try {
    const t = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, customDomain: true },
    })
    if (t) await invalidateTenant(t)
  } catch {
    // best-effort
  }
}
