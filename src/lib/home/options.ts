import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { courseCuratedForTenant } from "@/lib/catalog/visibility"

/**
 * Retorna as opções que o editor de seções precisa:
 * - Lista de categorias ativas (id, name, slug, displayOrder, courseCount)
 * - Lista de cursos ativos (id, nome, categoria) para popular o picker do
 *   modo manual. Limitado aos cursos que a vitrine pode exibir.
 *
 * Sem `tenantId` (editor do /admin, vitrine da PMB): `hiddenMain=false`. Com
 * `tenantId` (editor do painel): a curadoria por unidade. `hiddenMain` só vale
 * para a vitrine da PMB — usá-lo aqui escondia do editor da unidade liberada o
 * curso exclusivo dela (oculto na PMB justamente por ser exclusivo) e mostrava
 * às demais cursos que a home delas nunca renderiza.
 */
export async function getHomeSectionsOptions(tenantId: string | null = null) {
  const courseWhere: Prisma.CourseWhereInput = tenantId
    ? { status: "ATIVO", AND: [courseCuratedForTenant(tenantId)] }
    : { status: "ATIVO", hiddenMain: false }
  const [categories, courses] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        displayOrder: true,
        _count: {
          select: {
            courseLinks: {
              where: { course: courseWhere },
            },
          },
        },
      },
    }),
    prisma.course.findMany({
      where: courseWhere,
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        categoryLinks: { select: { categoryId: true } },
        capaImageUrl: true,
        capaOverride: true,
      },
    }),
  ])

  return NextResponse.json({
    data: {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        displayOrder: c.displayOrder,
        courseCount: c._count.courseLinks,
      })),
      courses: courses.map((c) => ({
        id: c.id,
        name: c.nome,
        // Um curso pode estar em varias categorias — o picker filtra por
        // inclusao (ver section-editors.tsx).
        categoryIds: c.categoryLinks.map((l) => l.categoryId),
        imageUrl: c.capaOverride ?? c.capaImageUrl,
      })),
    },
  })
}
