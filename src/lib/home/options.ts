import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Retorna as opções que o editor de seções precisa:
 * - Lista de categorias ativas (id, name, slug, displayOrder, courseCount)
 * - Lista de cursos ativos (id, nome, categoria) para popular o picker do
 *   modo manual. Limitado a cursos publicados (status=ATIVO, hiddenMain=false)
 *   para todas as vitrines.
 */
export async function getHomeSectionsOptions() {
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
            courses: {
              where: { status: "ATIVO", hiddenMain: false },
            },
          },
        },
      },
    }),
    prisma.course.findMany({
      where: { status: "ATIVO", hiddenMain: false },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        categoryId: true,
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
        courseCount: c._count.courses,
      })),
      courses: courses.map((c) => ({
        id: c.id,
        name: c.nome,
        categoryId: c.categoryId,
        imageUrl: c.capaOverride ?? c.capaImageUrl,
      })),
    },
  })
}
