import { prisma } from "@/lib/prisma"
import { planCourseWhere } from "./scope"
import { toScopeInput } from "./plans"

/**
 * Catalogo que a assinatura libera, para a area do aluno.
 *
 * Paginado porque um plano "catalogo inteiro" cobre 100+ cursos: carregar tudo
 * de uma vez faria a tela pesar e nao ajudaria ninguem a achar curso.
 */

export interface SubscriptionCourseCard {
  id: string
  nome: string
  slug: string
  capaUrl: string | null
  cargaHoraria: string | null
  qtdAulas: number
  /** Matricula ja existente — quando presente, o aluno "continua" em vez de "comecar". */
  enrollmentId: string | null
}

export interface SubscriptionCatalogPage {
  courses: SubscriptionCourseCard[]
  total: number
  page: number
  pageSize: number
}

export const CATALOG_PAGE_SIZE = 24

export async function loadSubscriptionCatalog(
  subscriptionId: string,
  opts: { page?: number; search?: string } = {},
): Promise<SubscriptionCatalogPage | null> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      studentId: true,
      tenantId: true,
      plan: {
        select: { scope: true, categoryIds: true, courseIds: true, packageId: true },
      },
    },
  })
  if (!sub) return null

  const scope = await toScopeInput(sub.plan)
  const page = Math.max(1, opts.page ?? 1)
  const search = opts.search?.trim()

  // A busca entra em AND com o escopo — nunca por spread, senão o `OR` dela
  // se fundiria com os `OR` dos gates de vitrine e um curso passaria por
  // casar o nome, ignorando visibilidade e preço.
  const where = search
    ? {
        AND: [
          planCourseWhere(scope, sub.tenantId),
          { nome: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : planCourseWhere(scope, sub.tenantId)

  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      select: {
        id: true,
        nome: true,
        slug: true,
        capaImageUrl: true,
        capaOverride: true,
        cargaHoraria: true,
        qtdAulas: true,
      },
      orderBy: [{ destaqueHome: "desc" }, { nome: "asc" }],
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
    }),
  ])

  // Matrículas que o aluno já tem entre os cursos DESTA página — inclui as de
  // compra avulsa, para não oferecer "Começar" num curso que ele já cursa.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: sub.studentId,
      courseId: { in: rows.map((r) => r.id) },
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: { id: true, courseId: true },
  })
  const byCourse = new Map(enrollments.map((e) => [e.courseId, e.id]))

  return {
    courses: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      slug: r.slug,
      capaUrl: r.capaOverride ?? r.capaImageUrl,
      cargaHoraria: r.cargaHoraria,
      qtdAulas: r.qtdAulas,
      enrollmentId: byCourse.get(r.id) ?? null,
    })),
    total,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  }
}
