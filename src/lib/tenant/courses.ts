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
  isFeatured: boolean
}

interface ListFilters {
  tenantId: string
  category?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listTenantCourses(
  filters: ListFilters,
): Promise<{ items: TenantCourseListItem[]; total: number }> {
  const where: Prisma.TenantCourseWhereInput = {
    tenantId: filters.tenantId,
    isVisible: true,
    course: {
      status: "ATIVO",
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
        descricao: tc.customDescription ?? tc.course.descricao,
        categoria: tc.course.categoriaLoja ?? tc.course.categoriaInterna,
        horas: tc.course.cargaHoraria,
        price: Number(tc.price),
        originalPrice: tc.course.precoOriginal
          ? Number(tc.course.precoOriginal)
          : null,
        imageUrl: tc.course.capaImageUrl,
        isFeatured: tc.isFeatured,
      })),
    }
  } catch (error) {
    console.error("[listTenantCourses] error:", error)
    return { items: [], total: 0 }
  }
}

export async function listTenantCategories(tenantId: string): Promise<string[]> {
  try {
    const result = await prisma.tenantCourse.findMany({
      where: { tenantId, isVisible: true, course: { status: "ATIVO" } },
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
