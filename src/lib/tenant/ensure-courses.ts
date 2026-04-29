import { prisma } from "@/lib/prisma"

/**
 * Garante que o tenant tenha um TenantCourse para cada curso ATIVO do
 * catálogo global. Idempotente: cria apenas o que está faltando.
 *
 * Default por curso:
 *  - price = precoVitrineMain || precoPromocional || precoOriginal || 0
 *  - paymentType = ONE_TIME
 *  - isVisible = true
 *  - isFeatured = course.destaque (espelha o flag do catálogo)
 */
export async function ensureTenantCourses(tenantId: string): Promise<number> {
  const [allActive, existing] = await Promise.all([
    prisma.course.findMany({
      where: { status: "ATIVO" },
      select: {
        id: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        destaque: true,
      },
    }),
    prisma.tenantCourse.findMany({
      where: { tenantId },
      select: { courseId: true },
    }),
  ])

  const existingIds = new Set(existing.map((tc) => tc.courseId))
  const missing = allActive.filter((c) => !existingIds.has(c.id))
  if (missing.length === 0) return 0

  const data = missing.map((c) => ({
    tenantId,
    courseId: c.id,
    price:
      Number(c.precoVitrineMain ?? 0) ||
      Number(c.precoPromocional ?? 0) ||
      Number(c.precoOriginal ?? 0) ||
      0,
    paymentType: "ONE_TIME" as const,
    isVisible: true,
    isFeatured: c.destaque,
    updatedAt: new Date(),
  }))

  await prisma.tenantCourse.createMany({
    data,
    skipDuplicates: true,
  })

  return data.length
}
