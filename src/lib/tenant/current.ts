import { cache } from "react"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { getTenantBranding, setTenantBranding } from "@/lib/redis/tenant-cache"

export interface CurrentTenant {
  id: string
  slug: string
  name: string
  status: string
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string
  secondaryColor: string
  tagline: string | null
  description: string | null
  whatsapp: string | null
  whatsappFloatEnabled: boolean
  whatsappFloatSide: string
  whatsappFloatMessage: string | null
  instagram: string | null
  facebook: string | null
  youtube: string | null
  tiktok: string | null
  supportEmail: string | null
  supportHours: string | null
  referralCode: string | null
  tecnicaEnabled: boolean
  tecnicaUrl: string | null
  tecnicaLabel: string | null
  tecnicaCourses: unknown // Json — parseado em tecnicaFromTenant
  ejaEnabled: boolean
  ejaUrl: string | null
  ejaLabel: string | null
  automationEnabled: boolean
}

export const getCurrentTenant = cache(
  async (): Promise<CurrentTenant | null> => {
    const h = await headers()
    const tenantId = h.get("x-tenant-id")
    const tenantSlug = h.get("x-tenant-slug")

    if (!tenantId && !tenantSlug) return null

    // PERF-001: quando o proxy injeta o id (caso comum), tenta o branding
    // cacheado no Redis antes de bater no Postgres. Cache por id — o resolve por
    // slug (raro, id ausente) segue direto no banco. Fail-open: um outage do
    // Redis (getTenantBranding => null) apenas cai no findFirst.
    if (tenantId) {
      const cached = await getTenantBranding<CurrentTenant>(tenantId)
      if (cached) return cached
    }

    try {
      const tenant = await prisma.tenant.findFirst({
        where: tenantId
          ? { id: tenantId }
          : { slug: tenantSlug ?? undefined },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          logoUrl: true,
          bannerUrl: true,
          primaryColor: true,
          secondaryColor: true,
          tagline: true,
          description: true,
          whatsapp: true,
          whatsappFloatEnabled: true,
          whatsappFloatSide: true,
          whatsappFloatMessage: true,
          instagram: true,
          facebook: true,
          youtube: true,
          tiktok: true,
          supportEmail: true,
          supportHours: true,
          referralCode: true,
          tecnicaEnabled: true,
          tecnicaUrl: true,
          tecnicaLabel: true,
          tecnicaCourses: true,
          ejaEnabled: true,
          ejaUrl: true,
          ejaLabel: true,
          automationEnabled: true,
        },
      })

      // Popula o cache de branding (best-effort). Chaveia pelo id REAL do tenant
      // — cobre inclusive o caminho resolvido por slug.
      if (tenant) {
        await setTenantBranding(tenant.id, tenant)
      }

      return tenant
    } catch (error) {
      contextLogger().error(
        { err: error, event: "getCurrentTenant.failed" },
        "getCurrentTenant falhou",
      )
      return null
    }
  },
)
