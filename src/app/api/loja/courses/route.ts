import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { resolveTenantFromRequest } from "@/lib/tenant/from-request"

const querySchema = z.object({
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export interface LojaCourseDTO {
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
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyMonths: number | null
}

export const GET = withRequestContext(
  { action: "loja.courses.list", route: "/api/loja/courses" },
  async (request: Request) => {
  // /api/loja/* recebe do proxy apenas x-tenant-slug — resolvemos por id-ou-slug.
  const tenant = await resolveTenantFromRequest(request)
  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant não identificado", code: "NO_TENANT" },
      { status: 400 },
    )
  }
  const tenantId = tenant.id

  let parsed: z.infer<typeof querySchema>
  try {
    const { searchParams } = new URL(request.url)
    parsed = querySchema.parse(Object.fromEntries(searchParams))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Parâmetros inválidos",
          code: "VALIDATION_ERROR",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }
    throw error
  }

  try {
    const items = await prisma.tenantCourse.findMany({
      where: {
        tenantId,
        isVisible: true,
        price: { gt: 0 },
        course: {
          status: "ATIVO",
          ...(parsed.category && parsed.category !== "todos"
            ? { categoriaLoja: { equals: parsed.category, mode: "insensitive" } }
            : {}),
          ...(parsed.search
            ? { nome: { contains: parsed.search, mode: "insensitive" } }
            : {}),
        },
      },
      include: { course: true },
      orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
      take: parsed.limit,
      skip: parsed.offset,
    })

    const total = await prisma.tenantCourse.count({
      where: {
        tenantId,
        isVisible: true,
        price: { gt: 0 },
        course: {
          status: "ATIVO",
          ...(parsed.category && parsed.category !== "todos"
            ? { categoriaLoja: { equals: parsed.category, mode: "insensitive" } }
            : {}),
          ...(parsed.search
            ? { nome: { contains: parsed.search, mode: "insensitive" } }
            : {}),
        },
      },
    })

    const data: LojaCourseDTO[] = items.map((tc) => ({
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
      paymentType: tc.paymentType,
      monthlyMonths: tc.course.monthlyMonthsMain,
    }))

    return NextResponse.json({
      data,
      meta: { total, limit: parsed.limit, offset: parsed.offset },
    })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "loja.courses.list_failed" },
      "listagem de cursos da loja falhou",
    )
    return NextResponse.json(
      { error: "Erro ao buscar cursos", code: "DB_ERROR" },
      { status: 500 },
    )
  }
  },
)
