import { prisma } from "@/lib/prisma"
import { PMB_TENANT_SLUG, PMB_TENANT_NAME } from "./pmb-config"

/**
 * Retorna o tenant placeholder PMB (criando se nao existir).
 * Usado para amarrar Students da vitrine principal sem tocar em Enrollment.tenantId (fica null).
 */
export async function getOrCreatePmbTenant(): Promise<{ id: string; slug: string }> {
  const existing = await prisma.tenant.findUnique({
    where: { slug: PMB_TENANT_SLUG },
    select: { id: true, slug: true },
  })
  if (existing) return existing

  const created = await prisma.tenant.create({
    data: {
      slug: PMB_TENANT_SLUG,
      name: PMB_TENANT_NAME,
      status: "ACTIVE",
      billingMode: "MANUAL",
      planValue: 0,
      // PMB placeholder usa um codigo de indicacao "interno" — nunca exposto.
      referralCode: "__PMB__",
      updatedAt: new Date(),
    },
    select: { id: true, slug: true },
  })
  return created
}
