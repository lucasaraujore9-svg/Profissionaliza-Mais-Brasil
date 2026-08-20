import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"

/**
 * Slug unico de um plano dentro do escopo (tenantId null = PMB, ou a revenda).
 * Mesma mecanica de `packages/slug.ts` — sufixo -2, -3... em colisao.
 */
export async function ensureUniquePlanSlug(
  tenantId: string | null,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || "assinatura"
  let candidate = base
  let n = 1
  for (let i = 0; i < 50; i++) {
    const clash = await prisma.subscriptionPlan.findFirst({
      where: {
        tenantId,
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    })
    if (!clash) return candidate
    n += 1
    candidate = `${base}-${n}`
  }
  return `${base}-${Date.now()}`
}
