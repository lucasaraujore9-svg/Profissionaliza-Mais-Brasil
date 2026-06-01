import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { contextLogger } from "@/lib/logger"

export interface TenantCourseListItem {
  id: string
  slug: string
  nome: string
  descricao: string | null
  categoria: string | null
  horas: string | null
  price: number
  originalPrice: number | null
  imageUrl: string | null
  parcelas: number | null
  isFeatured: boolean
  /** ONE_TIME = preco cheio; MONTHLY = mensalidade recorrente. */
  paymentType: "ONE_TIME" | "MONTHLY"
  /** Quantidade total de mensalidades quando paymentType === "MONTHLY". */
  monthlyMonths: number | null
}

interface ListFilters {
  tenantId: string
  category?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * Filtro aplicado em todas as queries de catalogo do tenant para respeitar
 * a visibilidade granular (`Course.visibilityMode`):
 *   - ALL       → todos podem ver (sem restricao)
 *   - ALLOWLIST → so se o tenant estiver em `allowedTenantIds`
 *   - DENYLIST  → todos exceto se o tenant estiver em `blockedTenantIds`
 */
function visibilityFilter(tenantId: string): Prisma.CourseWhereInput {
  return {
    OR: [
      { visibilityMode: "ALL" },
      { visibilityMode: "ALLOWLIST", allowedTenantIds: { has: tenantId } },
      { visibilityMode: "DENYLIST", NOT: { blockedTenantIds: { has: tenantId } } },
    ],
  }
}

type TenantCourseWithCourse = Prisma.TenantCourseGetPayload<{
  include: { course: true }
}>

/**
 * Mapeia um `TenantCourse` (com `course` incluido) para o item de catalogo
 * exibido na vitrine, aplicando a hierarquia de override tenant > admin >
 * plataforma bruto. Centralizado para que listagem e catalogo sejam consistentes.
 */
function mapTenantCourseItem(tc: TenantCourseWithCourse): TenantCourseListItem {
  // Parcelas efetivas configuradas pela unidade. Para MONTHLY este mesmo valor
  // representa a quantidade de mensalidades (o painel edita customParcelas como
  // "quantidade de mensalidades"); por isso monthlyMonths deve respeitá-lo, com
  // fallback no override admin global apenas quando a unidade não definiu nada.
  const effectiveParcelas =
    tc.customParcelas ??
    tc.course.parcelasOverride ??
    tc.course.parcelasSugeridas
  return {
    id: tc.id,
    slug: tc.course.slug,
    nome: tc.course.nome,
    descricao:
      tc.customDescription ??
      tc.course.descricaoOverride ??
      tc.course.descricao,
    categoria: tc.course.categoriaLoja ?? tc.course.categoriaInterna,
    horas: tc.course.cargaHoraria,
    price: Number(tc.price),
    originalPrice: tc.course.precoOriginal
      ? Number(tc.course.precoOriginal)
      : null,
    imageUrl:
      tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
    parcelas: effectiveParcelas,
    isFeatured: tc.isFeatured,
    paymentType: tc.paymentType,
    monthlyMonths: effectiveParcelas ?? tc.course.monthlyMonthsMain,
  }
}

export async function listTenantCourses(
  filters: ListFilters,
): Promise<{ items: TenantCourseListItem[]; total: number }> {
  const where: Prisma.TenantCourseWhereInput = {
    tenantId: filters.tenantId,
    isVisible: true,
    course: {
      status: "ATIVO",
      ...visibilityFilter(filters.tenantId),
      ...(filters.category && filters.category !== "todos"
        ? {
            categoriaLoja: {
              equals: filters.category,
              mode: "insensitive",
            },
          }
        : {}),
      ...(filters.search
        ? { nome: { contains: filters.search, mode: "insensitive" } }
        : {}),
    },
  }

  try {
    const [items, total] = await Promise.all([
      prisma.tenantCourse.findMany({
        where,
        include: { course: true },
        orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
      }),
      prisma.tenantCourse.count({ where }),
    ])

    return {
      total,
      items: items.map(mapTenantCourseItem),
    }
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.listCourses_failed" },
      "listTenantCourses falhou",
    )
    return { items: [], total: 0 }
  }
}

export interface TenantCatalogCategory {
  nome: string
  slug: string
}

/**
 * Categorias (Category) que possuem ao menos um curso visivel na vitrine deste
 * tenant. Usa slug+name canonicos da Category (mesma fonte do menu), para que os
 * filtros do catalogo da loja casem com os links `/cursos?categoria={slug}`.
 */
async function tenantCatalogCategories(
  tenantId: string,
): Promise<TenantCatalogCategory[]> {
  const cats = await prisma.category.findMany({
    where: {
      isActive: true,
      courses: {
        some: {
          status: "ATIVO",
          ...visibilityFilter(tenantId),
          tenantCourses: { some: { tenantId, isVisible: true } },
        },
      },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { name: true, slug: true },
  })
  return cats.map((c) => ({ nome: c.name, slug: c.slug }))
}

/**
 * Catalogo completo da vitrine do revendedor ("todos os cursos"). Diferente de
 * `loadCatalogo` (catalogo global PMB), respeita o tenant: so cursos com
 * `TenantCourse.isVisible` + `visibilityMode`, com preco/capa da unidade. O
 * filtro de categoria recebe o SLUG da Category (resolvido para categoryId),
 * coerente com os links do menu e da home.
 */
export async function listTenantCatalog(args: {
  tenantId: string
  categorySlug?: string
  search?: string
}): Promise<{
  items: TenantCourseListItem[]
  total: number
  categories: TenantCatalogCategory[]
}> {
  const { tenantId, categorySlug, search } = args
  try {
    let categoryId: string | undefined
    if (categorySlug && categorySlug !== "todos") {
      const cat = await prisma.category.findUnique({
        where: { slug: categorySlug },
        select: { id: true, isActive: true },
      })
      // Categoria inexistente/inativa: catalogo vazio, mas ainda mostra os pills.
      if (!cat || !cat.isActive) {
        return { items: [], total: 0, categories: await tenantCatalogCategories(tenantId) }
      }
      categoryId = cat.id
    }

    const where: Prisma.TenantCourseWhereInput = {
      tenantId,
      isVisible: true,
      course: {
        status: "ATIVO",
        ...visibilityFilter(tenantId),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
      },
    }

    const [rows, total, categories] = await Promise.all([
      prisma.tenantCourse.findMany({
        where,
        include: { course: true },
        orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }, { course: { nome: "asc" } }],
      }),
      prisma.tenantCourse.count({ where }),
      tenantCatalogCategories(tenantId),
    ])

    return { items: rows.map(mapTenantCourseItem), total, categories }
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.listCatalog_failed", tenantId },
      "listTenantCatalog falhou",
    )
    return { items: [], total: 0, categories: [] }
  }
}

export interface TenantCourseDetail extends TenantCourseListItem {
  tenantCourseId: string
  qtdAulas: number
  parcelasSugeridas: number | null
  plataformaCourseId: string | null
  lessons: Array<{ id: string; nome: string; ordem: number }>
}

export async function getTenantCourseBySlug(
  tenantId: string,
  slug: string,
): Promise<TenantCourseDetail | null> {
  try {
    const tc = await prisma.tenantCourse.findFirst({
      where: {
        tenantId,
        isVisible: true,
        course: { status: "ATIVO", slug, ...visibilityFilter(tenantId) },
      },
      include: {
        course: {
          include: {
            courseLessons: { orderBy: { ordem: "asc" } },
          },
        },
      },
    })

    if (!tc) return null

    // Parcelas efetivas da unidade. Para MONTHLY, equivale à quantidade de
    // mensalidades (ver mapTenantCourseItem).
    const effectiveParcelas =
      tc.customParcelas ??
      tc.course.parcelasOverride ??
      tc.course.parcelasSugeridas

    return {
      id: tc.id,
      tenantCourseId: tc.id,
      slug: tc.course.slug,
      nome: tc.course.nome,
      descricao:
        tc.customDescription ??
        tc.course.descricaoOverride ??
        tc.course.descricao,
      categoria: tc.course.categoriaLoja ?? tc.course.categoriaInterna,
      horas: tc.course.cargaHoraria,
      price: Number(tc.price),
      originalPrice: tc.course.precoOriginal
        ? Number(tc.course.precoOriginal)
        : null,
      imageUrl:
        tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
      parcelas: effectiveParcelas,
      isFeatured: tc.isFeatured,
      paymentType: tc.paymentType,
      monthlyMonths: effectiveParcelas ?? tc.course.monthlyMonthsMain,
      qtdAulas: tc.course.qtdAulas,
      parcelasSugeridas: effectiveParcelas,
      plataformaCourseId: tc.course.plataformaCourseId,
      lessons: tc.course.courseLessons.map((l) => ({
        id: l.id,
        nome: l.nome,
        ordem: l.ordem,
      })),
    }
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.getCourseBySlug_failed" },
      "getTenantCourseBySlug falhou",
    )
    return null
  }
}

export async function listTenantCategories(tenantId: string): Promise<string[]> {
  try {
    const result = await prisma.tenantCourse.findMany({
      where: {
        tenantId,
        isVisible: true,
        course: { status: "ATIVO", ...visibilityFilter(tenantId) },
      },
      select: {
        course: { select: { categoriaLoja: true, categoriaInterna: true } },
      },
    })

    const set = new Set<string>()
    for (const tc of result) {
      const cat = tc.course.categoriaLoja ?? tc.course.categoriaInterna
      if (cat) set.add(cat)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.listCategories_failed", tenantId },
      "listTenantCategories falhou",
    )
    return []
  }
}
