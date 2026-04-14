import { cache } from "react"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

export interface CurrentTenant {
  id: string
  slug: string
  name: string
  status: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  tagline: string | null
  description: string | null
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
          primaryColor: true,
          secondaryColor: true,
          tagline: true,
          description: true,
        },
      })

      return tenant
    } catch (error) {
      console.error("[getCurrentTenant] error:", error)
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
