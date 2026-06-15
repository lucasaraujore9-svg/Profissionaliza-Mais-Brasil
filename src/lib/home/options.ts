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
            courseLinks: {
              where: { course: { status: "ATIVO", hiddenMain: false } },
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
