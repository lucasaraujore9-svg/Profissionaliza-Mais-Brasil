import { prisma } from "@/lib/prisma"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

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

/**
 * Propaga UM curso para todas as revendas elegiveis, criando o TenantCourse que
 * falta com os defaults da vitrine (isVisible=true, preco herdado do catalogo).
 * E o inverso de `ensureTenantCourses` (um curso -> muitos tenants).
 *
 * Usado quando um curso e importado JA ATIVO (ex: curso LMS com valor+categoria):
 * sem isto a vitrine publica da revenda so mostraria o curso depois que o painel
 * dela rodasse o `ensureTenantCourses`. Idempotente via skipDuplicates.
 *
 * Escopo: exclui a vitrine-mae placeholder (__pmb__) e tenants CANCELLED. Sem
 * preco efetivo (> 0) nao propaga (a vitrine exige price > 0).
 */
export async function ensureCourseForResellers(courseId: string): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      status: true,
      precoVitrineMain: true,
      precoPromocional: true,
      precoOriginal: true,
      destaque: true,
    },
  })
  if (!course || course.status !== "ATIVO") return 0

  const price =
    Number(course.precoVitrineMain ?? 0) ||
    Number(course.precoPromocional ?? 0) ||
    Number(course.precoOriginal ?? 0) ||
    0
  if (price <= 0) return 0

  const tenants = await prisma.tenant.findMany({
    where: {
      status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] },
      slug: { not: PMB_TENANT_SLUG },
      NOT: { tenantCourses: { some: { courseId } } },
    },
    select: { id: true },
  })
  if (tenants.length === 0) return 0

  await prisma.tenantCourse.createMany({
    data: tenants.map((t) => ({
      tenantId: t.id,
      courseId,
      price,
      paymentType: "ONE_TIME" as const,
      isVisible: true,
      isFeatured: course.destaque,
      updatedAt: new Date(),
    })),
    skipDuplicates: true,
  })

  return tenants.length
}
