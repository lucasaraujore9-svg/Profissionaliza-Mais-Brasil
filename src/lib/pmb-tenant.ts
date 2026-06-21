import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { PMB_TENANT_SLUG, PMB_TENANT_NAME } from "./pmb-config"

/**
 * Retorna o tenant placeholder PMB (criando se nao existir).
 * Usado para amarrar Students da vitrine principal sem tocar em Enrollment.tenantId (fica null).
 *
 * DB-005: race-safe. Dois webhooks PMB concorrentes podiam passar pelo findUnique
 * juntos e tentar criar o mesmo slug — o segundo create estourava P2002 e derrubava
 * o fulfillment. Agora o create é protegido: o perdedor da corrida (unique no slug)
 * captura P2002 e re-busca o registro criado pelo vencedor.
 */
export async function getOrCreatePmbTenant(): Promise<{ id: string; slug: string }> {
  const existing = await prisma.tenant.findUnique({
    where: { slug: PMB_TENANT_SLUG },
    select: { id: true, slug: true },
  })
  if (existing) return existing

  try {
    return await prisma.tenant.create({
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
  } catch (error) {
    // P2002 = unique violation: outra request criou o tenant PMB concorrentemente.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.tenant.findUnique({
        where: { slug: PMB_TENANT_SLUG },
        select: { id: true, slug: true },
      })
      if (winner) return winner
    }
    throw error
  }
}
