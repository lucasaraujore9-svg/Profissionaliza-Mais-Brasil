import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validateTenantCoursePrice } from "@/lib/course-authoring/split-server"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import {
  APRENDIZADO_MAX_ITEMS,
  APRENDIZADO_MAX_LEN,
} from "@/lib/courses/aprendizado"
import { requireAdmin } from "@/lib/auth/admin-guard"

/**
 * Bullets de "O que você vai aprender". Lista vazia é válida e significa
 * "voltar ao texto genérico" — o mesmo contrato usado no painel da revenda.
 */
const aprendizadoSchema = z
  .array(z.string().trim().min(1).max(APRENDIZADO_MAX_LEN))
  .max(APRENDIZADO_MAX_ITEMS)

const patchSchema = z.object({
  precoVitrineMain: z.number().nonnegative().nullable().optional(),
  // Preco de tabela ("De R$ X" riscado). null = vitrine sem "De".
  precoDeVitrineMain: z.number().positive().nullable().optional(),
  destaqueHome: z.boolean().optional(),
  ordemHome: z.number().int().nullable().optional(),
  descricaoOverride: z.string().nullable().optional(),
  aprendizado: aprendizadoSchema.optional(),
  capaOverride: z.string().url().nullable().optional(),
  parcelasOverride: z.number().int().min(1).max(24).nullable().optional(),
  categoriaLoja: z.string().nullable().optional(),
  // Categoria principal (legado/compat). Continua aceito, mas `categoryIds`
  // tem prioridade quando enviado.
  categoryId: z.string().cuid().nullable().optional(),
  // Lista completa de categorias do curso (M2M). A primeira vira a principal.
  // Sem limite de quantidade.
  categoryIds: z.array(z.string().cuid()).optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  hiddenMain: z.boolean().optional(),
  paymentTypeMain: z.enum(["ONE_TIME", "MONTHLY"]).optional(),
  monthlyMonthsMain: z.number().int().min(1).max(60).nullable().optional(),
  visibilityMode: z.enum(["ALL", "ALLOWLIST", "DENYLIST"]).optional(),
  allowedTenantIds: z.array(z.string().cuid()).optional(),
  blockedTenantIds: z.array(z.string().cuid()).optional(),
})

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.catalogo.get", route: "/api/admin/catalogo/[id]" },
  async (_req: Request, { params }) => {
  const guard = await requireAdmin("catalogo.view")
  if (!guard.ok) return guard.response

  const { id } = await params
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      slug: true,
      descricao: true,
      qtdAulas: true,
      cargaHoraria: true,
      precoOriginal: true,
      precoPromocional: true,
      categoriaLoja: true,
      categoryId: true,
      category: { select: { id: true, name: true, slug: true } },
      categoryLinks: {
        select: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: { category: { name: "asc" } },
      },
      visibilityMode: true,
      allowedTenantIds: true,
      blockedTenantIds: true,
      status: true,
      capaImageUrl: true,
      precoVitrineMain: true,
      precoDeVitrineMain: true,
      destaqueHome: true,
      ordemHome: true,
      descricaoOverride: true,
      aprendizado: true,
      capaOverride: true,
      parcelasSugeridas: true,
      parcelasOverride: true,
      hiddenMain: true,
      paymentTypeMain: true,
      monthlyMonthsMain: true,
    },
  })
  if (!course) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const { categoryLinks, ...rest } = course
  const categories = categoryLinks.map((l) => l.category)

  return NextResponse.json({
    data: {
      ...rest,
      categories,
      categoryIds: categories.map((c) => c.id),
      precoOriginal: course.precoOriginal ? Number(course.precoOriginal) : null,
      precoPromocional: course.precoPromocional ? Number(course.precoPromocional) : null,
      precoVitrineMain: course.precoVitrineMain ? Number(course.precoVitrineMain) : null,
      precoDeVitrineMain: course.precoDeVitrineMain
        ? Number(course.precoDeVitrineMain)
        : null,
    },
  })
  },
)

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.catalogo.update", route: "/api/admin/catalogo/[id]" },
  async (req: Request, { params }) => {
  const guard = await requireAdmin("catalogo.manage")
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", issues: parsed.error.issues }, { status: 400 })
  }

  // Separa `categoryIds` (relacao M2M) dos campos escalares do Course.
  const { categoryIds, ...data } = parsed.data

  // Curso produzido por uma unidade tem termos comerciais definidos por ELA: o
  // /admin escolhe se o curso entra na vitrine da PMB, nao por quanto o produtor
  // vende. Sem esta checagem o preco invalido era gravado, o curso continuava
  // listado e quem recusava era o `authoredSaleGate` — com o aluno na tela de
  // pagamento. Mesma regra que /api/painel/cursos ja aplica na escrita.
  if (data.precoVitrineMain != null) {
    const priceError = await validateTenantCoursePrice(id, null, data.precoVitrineMain)
    if (priceError) {
      return NextResponse.json(
        { error: priceError.error, code: priceError.code },
        { status: 400 },
      )
    }
  }

  // Preco de tabela precisa ser MAIOR que o preco de venda, senao a vitrine
  // simplesmente nao desenha o "De" — salvar em silencio deixaria o admin
  // achando que configurou algo que nunca aparece. Compara contra o preco que
  // VAI valer depois deste PATCH (o do corpo quando enviado, senao o gravado).
  if (data.precoDeVitrineMain != null) {
    const atual = await prisma.course.findUnique({
      where: { id },
      select: {
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
      },
    })
    if (!atual) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    }
    const precoVenda =
      Number(
        data.precoVitrineMain !== undefined
          ? data.precoVitrineMain
          : atual.precoVitrineMain,
      ) ||
      Number(atual.precoPromocional ?? 0) ||
      Number(atual.precoOriginal ?? 0)
    if (precoVenda > 0 && data.precoDeVitrineMain <= precoVenda) {
      return NextResponse.json(
        {
          error:
            "O preço de tabela precisa ser maior que o preço de venda para aparecer como \"De\" na vitrine.",
          code: "COMPARE_AT_NOT_GREATER",
        },
        { status: 400 },
      )
    }
  }

  // Se mudou para ONE_TIME, zera monthlyMonthsMain. Se MONTHLY sem meses,
  // garante um default razoavel.
  if (data.paymentTypeMain === "ONE_TIME") {
    data.monthlyMonthsMain = null
  }
  if (data.paymentTypeMain === "MONTHLY" && data.monthlyMonthsMain === undefined) {
    data.monthlyMonthsMain = 12
  }

  // Normaliza a entrada de categorias: `categoryIds` (M2M) tem prioridade;
  // se vier so o legado `categoryId`, deriva a lista a partir dele para manter
  // join e categoria principal consistentes.
  const incomingCategoryIds =
    categoryIds !== undefined
      ? categoryIds
      : data.categoryId !== undefined
        ? data.categoryId
          ? [data.categoryId]
          : []
        : undefined

  // Quando ha entrada de categorias, ela e a fonte de verdade do pertencimento:
  // a primeira vira a categoria principal (categoryId) e o join e reescrito por
  // completo. Sem limite de quantidade.
  if (incomingCategoryIds !== undefined) {
    const uniqueIds = [...new Set(incomingCategoryIds)]
    if (uniqueIds.length > 0) {
      // Garante que todos os ids existem (evita FK error silencioso).
      const found = await prisma.category.count({ where: { id: { in: uniqueIds } } })
      if (found !== uniqueIds.length) {
        return NextResponse.json({ error: "Categoria inexistente" }, { status: 400 })
      }
    }
    data.categoryId = uniqueIds[0] ?? null
    await prisma.$transaction([
      prisma.courseCategory.deleteMany({
        where: { courseId: id, categoryId: { notIn: uniqueIds } },
      }),
      prisma.courseCategory.createMany({
        data: uniqueIds.map((categoryId) => ({ courseId: id, categoryId })),
        skipDuplicates: true,
      }),
    ])
  }

  const updated = await prisma.course.update({
    where: { id },
    data,
    select: {
      id: true,
      precoVitrineMain: true,
      precoDeVitrineMain: true,
      destaqueHome: true,
      ordemHome: true,
      descricaoOverride: true,
      aprendizado: true,
      capaOverride: true,
      parcelasOverride: true,
      categoriaLoja: true,
      categoryId: true,
      visibilityMode: true,
      allowedTenantIds: true,
      blockedTenantIds: true,
      status: true,
      hiddenMain: true,
      paymentTypeMain: true,
      monthlyMonthsMain: true,
    },
  })

  return NextResponse.json({
    data: {
      ...updated,
      precoVitrineMain: updated.precoVitrineMain ? Number(updated.precoVitrineMain) : null,
      precoDeVitrineMain: updated.precoDeVitrineMain
        ? Number(updated.precoDeVitrineMain)
        : null,
    },
  })
  },
)
