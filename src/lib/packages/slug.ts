import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"

/**
 * Gera um slug único para um pacote dentro do escopo (tenantId null = PMB, ou a
 * revenda). Respeita o @@unique([tenantId, slug]) — adiciona sufixo -2, -3, ...
 * em colisão. `excludeId` permite reusar o próprio slug ao editar.
 */
export async function ensureUniquePackageSlug(
  tenantId: string | null,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || "pacote"
  let candidate = base
  let n = 1
  // Loop limitado: na prática 1-2 iterações; cap defensivo.
  for (let i = 0; i < 50; i++) {
    const clash = await prisma.coursePackage.findFirst({
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
  // Fallback improvável: sufixo temporal-ish via contagem.
  return `${base}-${Date.now().toString(36)}`
}
