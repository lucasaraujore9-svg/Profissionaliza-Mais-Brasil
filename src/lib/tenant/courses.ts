import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

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
      items: items.map((tc) => ({
        id: tc.id,
        slug: tc.course.slug,
        nome: tc.course.nome,
        // Hierarquia: tenant > admin > plataforma bruto
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
        parcelas:
          tc.customParcelas ??
          tc.course.parcelasOverride ??
          tc.course.parcelasSugeridas,
        isFeatured: tc.isFeatured,
      })),
    }
  } catch (error) {
    console.error("[listTenantCourses] error:", error)
    return { items: [], total: 0 }
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
      parcelas:
        tc.customParcelas ??
        tc.course.parcelasOverride ??
        tc.course.parcelasSugeridas,
      isFeatured: tc.isFeatured,
      qtdAulas: tc.course.qtdAulas,
      parcelasSugeridas:
        tc.customParcelas ??
        tc.course.parcelasOverride ??
        tc.course.parcelasSugeridas,
      plataformaCourseId: tc.course.plataformaCourseId,
      lessons: tc.course.courseLessons.map((l) => ({
        id: l.id,
        nome: l.nome,
        ordem: l.ordem,
      })),
    }
  } catch (error) {
    console.error("[getTenantCourseBySlug] error:", error)
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
    console.error("[listTenantCategories] error:", error)
    return []
  }
}
