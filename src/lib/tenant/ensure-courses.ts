import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { minSalePrice, type AuthorTerms } from "@/lib/course-authoring/split"
import { COURSE_PROVISIONABLE } from "@/lib/catalog/visibility"

/**
 * Colunas de autoria necessarias para decidir se um curso entra na vitrine de
 * uma unidade e por quanto ele nasce la.
 */
const AUTHORING_FIELDS = {
  authorTenantId: true,
  authoredStatus: true,
  distribution: true,
  pricingMode: true,
  authorAmount: true,
  sellerCommissionPercent: true,
  platformFeePercent: true,
} as const

type CourseSeed = {
  id: string
  precoVitrineMain: unknown
  precoPromocional: unknown
  precoOriginal: unknown
  destaque: boolean
  authorTenantId: string | null
  pricingMode: "FIXED" | "MIN_PRICE" | "MIN_PRODUCER_NET"
  authorAmount: unknown
  sellerCommissionPercent: unknown
  platformFeePercent: unknown
}

/**
 * Quais cursos do catalogo global esta unidade pode ter na vitrine.
 *
 * Antes o filtro era so `status: "ATIVO"` — sem nenhuma nocao de origem. Com
 * curso de autoria isso passaria o curso da unidade A para a vitrine de B, C e
 * D no instante em que ele fosse criado, ainda em rascunho.
 *
 * `hasWallet` e o gate de KYC: curso de OUTRA unidade so entra para quem tem
 * carteira Asaas, porque o rateio precisa de um destino. Melhor nao aparecer do
 * que aparecer e quebrar no checkout com o aluno na tela.
 */
export function catalogScopeForTenant(
  tenantId: string,
  hasWallet: boolean,
): Prisma.CourseWhereInput {
  const scope: Prisma.CourseWhereInput[] = [
    // Catalogo da PMB — todo o legado e tudo que vem do sync das fornecedoras.
    { authorTenantId: null },
    // Os proprios cursos da unidade, em qualquer alcance (inclusive OWN_ONLY) e
    // em qualquer estagio: ela precisa ver o rascunho dela no painel.
    { authorTenantId: tenantId },
  ]
  if (hasWallet) {
    scope.push({
      authorTenantId: { not: null },
      distribution: "NETWORK",
      authoredStatus: "PUBLISHED",
    })
  }
  // Mesmo espirito do gate de carteira: curso que a plataforma de aulas nao
  // consegue matricular nao e propagado para vitrine nenhuma. Sem isto, uma
  // linha sem id da fornecedora ganha um TenantCourse em CADA unidade e so
  // aparece o problema no fim do checkout, com o aluno ja cobrado.
  return { status: "ATIVO", AND: [COURSE_PROVISIONABLE], OR: scope }
}

/**
 * Preco com que o curso NASCE na vitrine da unidade.
 *
 * Curso de autoria de terceiro nao herda o preco do catalogo PMB: ele nasce no
 * preco que o produtor determinou (FIXED) ou no piso vendavel (os dois modos de
 * minimo). Nascer abaixo do piso deixaria a linha invendavel — a unidade veria
 * o curso no painel e tomaria erro ao tentar publicar.
 */
export function initialTenantCoursePrice(
  course: CourseSeed,
  tenantId?: string,
): number {
  if (course.authorTenantId !== null) {
    // Na loja do PRÓPRIO autor não há rateio: o piso, que só existe para
    // acomodar comissão e taxa, nasceria inflado. Ele recebe o valor cheio.
    if (tenantId && course.authorTenantId === tenantId) {
      return Number(course.authorAmount ?? 0)
    }
    const terms: AuthorTerms = {
      pricingMode: course.pricingMode,
      authorAmount: Number(course.authorAmount ?? 0),
      sellerCommissionPercent: Number(course.sellerCommissionPercent ?? 0),
      platformFeePercent: Number(course.platformFeePercent ?? 0),
    }
    if (terms.authorAmount <= 0) return 0
    const floor = minSalePrice(terms)
    return Number.isFinite(floor) ? floor : 0
  }
  return (
    Number(course.precoVitrineMain ?? 0) ||
    Number(course.precoPromocional ?? 0) ||
    Number(course.precoOriginal ?? 0) ||
    0
  )
}

/**
 * Garante que o tenant tenha um TenantCourse para cada curso do catalogo que
 * ele ALCANCA. Idempotente: cria apenas o que está faltando.
 *
 * Default por curso:
 *  - price = ver `initialTenantCoursePrice`
 *  - paymentType = ONE_TIME
 *  - isVisible = true  (curso de autoria da rede nasce VISIVEL e a unidade
 *    desativa se nao quiser — decisao do dono, igual ao curso da PMB)
 *  - isFeatured = course.destaque (espelha o flag do catálogo)
 */
export async function ensureTenantCourses(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { asaasWalletId: true },
  })

  const [allActive, existing] = await Promise.all([
    prisma.course.findMany({
      where: catalogScopeForTenant(tenantId, Boolean(tenant?.asaasWalletId)),
      select: {
        id: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        destaque: true,
        ...AUTHORING_FIELDS,
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
    price: initialTenantCoursePrice(c, tenantId),
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
 * Usado quando um curso e importado JA ATIVO (ex: curso LMS com valor+categoria)
 * e quando uma unidade PUBLICA um curso proprio para a rede: sem isto a vitrine
 * publica da revenda so mostraria o curso depois que o painel dela rodasse o
 * `ensureTenantCourses`. Idempotente via skipDuplicates.
 *
 * Escopo: exclui a vitrine-mae placeholder (__pmb__) e tenants CANCELLED. Sem
 * preco efetivo (> 0) nao propaga (a vitrine exige price > 0). Curso de autoria
 * so alcanca a rede quando esta PUBLICADO com distribution=NETWORK, e so
 * unidades com carteira Asaas — as demais nao teriam para onde mandar o repasse.
 */
export async function ensureCourseForResellers(courseId: string): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      status: true,
      provider: true,
      plataformaCourseId: true,
      lmsCourseId: true,
      precoVitrineMain: true,
      precoPromocional: true,
      precoOriginal: true,
      destaque: true,
      ...AUTHORING_FIELDS,
    },
  })
  if (!course || course.status !== "ATIVO") return 0

  // Espelha `COURSE_PROVISIONABLE` no sentido inverso (um curso -> muitos
  // tenants). Este e o caminho que espalhou o curso 267 renomeado por 18
  // vitrines: ele roda no CREATE do sync, quando a linha ainda nao tinha id da
  // fornecedora. Um `where` nao cabe aqui (a linha ja veio carregada), entao a
  // regra e repetida como guarda — se as duas divergirem, esta e a mais nova.
  const providerId =
    course.provider === "LMS" ? course.lmsCourseId : course.plataformaCourseId
  if (!providerId) return 0

  const isAuthored = course.authorTenantId !== null
  if (
    isAuthored &&
    (course.distribution !== "NETWORK" || course.authoredStatus !== "PUBLISHED")
  ) {
    return 0
  }

  const price = initialTenantCoursePrice({ id: courseId, ...course })
  if (price <= 0) return 0

  const tenants = await prisma.tenant.findMany({
    where: {
      status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] },
      slug: { not: PMB_TENANT_SLUG },
      NOT: { tenantCourses: { some: { courseId } } },
      // Curso de autoria exige destino de repasse na ponta que vende. O AUTOR
      // entra sempre: na loja dele nao ha rateio nenhum.
      ...(isAuthored
        ? {
            OR: [
              { id: course.authorTenantId as string },
              { asaasWalletId: { not: null } },
            ],
          }
        : {}),
    },
    select: { id: true },
  })
  if (tenants.length === 0) return 0

  await prisma.tenantCourse.createMany({
    data: tenants.map((t) => ({
      tenantId: t.id,
      courseId,
      price:
        isAuthored && t.id === course.authorTenantId
          ? Number(course.authorAmount ?? 0) || price
          : price,
      paymentType: "ONE_TIME" as const,
      isVisible: true,
      isFeatured: course.destaque,
      updatedAt: new Date(),
    })),
    skipDuplicates: true,
  })

  return tenants.length
}
