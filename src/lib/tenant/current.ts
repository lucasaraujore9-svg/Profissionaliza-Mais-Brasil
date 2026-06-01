import { cache } from "react"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"

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
  instagram: string | null
  facebook: string | null
  supportEmail: string | null
  supportHours: string | null
  referralCode: string | null
  tecnicaEnabled: boolean
  tecnicaUrl: string | null
  tecnicaLabel: string | null
  tecnicaCourses: unknown // Json — parseado em tecnicaFromTenant
  automationEnabled: boolean
}

export const getCurrentTenant = cache(
  async (): Promise<CurrentTenant | null> => {
    const h = await headers()
    const tenantId = h.get("x-tenant-id")
    const tenantSlug = h.get("x-tenant-slug")

    if (!tenantId && !tenantSlug) return null

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
          instagram: true,
          facebook: true,
          supportEmail: true,
          supportHours: true,
          referralCode: true,
          tecnicaEnabled: true,
          tecnicaUrl: true,
          tecnicaLabel: true,
          tecnicaCourses: true,
          automationEnabled: true,
        },
      })

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

export async function requireCurrentTenant(): Promise<CurrentTenant> {
  const tenant = await getCurrentTenant()
  if (!tenant) {
    throw new Error("Tenant not found in request context")
  }
  return tenant
}
