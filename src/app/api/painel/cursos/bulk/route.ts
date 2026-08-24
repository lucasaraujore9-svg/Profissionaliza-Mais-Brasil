import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import {
  AUTHORED_COURSE_SELECT,
  validateSalePriceForCourse,
} from "@/lib/course-authoring/split-server"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { runInChunks } from "@/lib/concurrency"
import {
  APRENDIZADO_MAX_ITEMS,
  APRENDIZADO_MAX_LEN,
} from "@/lib/courses/aprendizado"
import { BULK_EDIT_MAX_ITEMS } from "@/lib/courses/bulk-edit"

// PERF-013: nº de updates individuais concorrentes por lote.
const BULK_CONCURRENCY = 10

/* ------------------------------------------------------------------ */
/* GET — dados enxutos para a edição em massa (planilha)               */
/* Retorna apenas os campos editáveis em lote: preço, parcelas sem     */
/* juros (informativo) e descrição customizada.                        */
/* ------------------------------------------------------------------ */
export const GET = withRequestContext(
  { action: "painel.cursos.bulk.list", route: "/api/painel/cursos/bulk" },
  async () => {
    const guard = await requirePainel("catalogo.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    await ensureTenantCourses(ctx.tenantId)

    const tenantCourses = await prisma.tenantCourse.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ customOrder: "asc" }, { createdAt: "desc" }],
      include: {
        course: {
          select: {
            nome: true,
            descricao: true,
            descricaoOverride: true,
            parcelasSugeridas: true,
            parcelasOverride: true,
            aprendizado: true,
          },
        },
      },
    })

    return NextResponse.json({
      data: tenantCourses.map((tc) => ({
        id: tc.id,
        title: tc.course.nome,
        price: Number(tc.price),
        precoDe: tc.precoDe != null ? Number(tc.precoDe) : null,
        paymentType: tc.paymentType,
        customParcelas: tc.customParcelas,
        defaultParcelas:
          tc.course.parcelasOverride ?? tc.course.parcelasSugeridas,
        customDescription: tc.customDescription,
        defaultDescription:
          tc.course.descricaoOverride ?? tc.course.descricao,
        customAprendizado: tc.customAprendizado,
        defaultAprendizado: tc.course.aprendizado,
      })),
    })
  },
)

/* ------------------------------------------------------------------ */
/* PUT — atualização em lote                                            */
/* Aceita só os campos da planilha. Não toca em paymentType,           */
/* visibilidade, destaque, capa, etc.                                  */
/* ------------------------------------------------------------------ */
const itemSchema = z.object({
  id: z.string().min(1),
  price: z.number().positive("Preço deve ser maior que zero").optional(),
  // Preco de tabela ("De R$ X"). null = limpar (a vitrine deixa de exibir "De").
  precoDe: z.number().positive().nullable().optional(),
  customParcelas: z.number().int().min(1).max(24).nullable().optional(),
  customDescription: z.string().trim().max(2000).nullable().optional(),
  // Lista vazia = volta ao padrão definido pela PMB no catálogo mãe.
  customAprendizado: z
    .array(z.string().trim().min(1).max(APRENDIZADO_MAX_LEN))
    .max(APRENDIZADO_MAX_ITEMS)
    .optional(),
})

const bulkSchema = z.object({
  items: z
    .array(itemSchema)
    .min(1)
    .max(
      BULK_EDIT_MAX_ITEMS,
      `Envie no maximo ${BULK_EDIT_MAX_ITEMS} cursos por vez.`,
    ),
})

export const PUT = withRequestContext(
  { action: "painel.cursos.bulk.update", route: "/api/painel/cursos/bulk" },
  async (request: Request) => {
    const guard = await requirePainel("catalogo.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bulkSchema.safeParse(payload)
    if (!parsed.success) {
      // `detail` e a UNICA parte que a planilha mostra na tela. Sem ela, um
      // lote grande demais (ou um campo fora de faixa) virava um "Dados
      // invalidos" seco, sem dizer qual linha nem por que.
      return NextResponse.json(
        {
          error: "Dados inválidos",
          detail: parsed.error.issues[0]?.message,
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Garante que TODOS os cursos pertencem ao tenant (anti cross-tenant).
    const ids = parsed.data.items.map((it) => it.id)
    const owned = await prisma.tenantCourse.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
      select: { id: true, courseId: true, price: true },
    })
    const ownedIds = new Set(owned.map((o) => o.id))
    const foreign = ids.filter((id) => !ownedIds.has(id))
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: "Um ou mais cursos não pertencem à sua unidade." },
        { status: 403 },
      )
    }

    // Piso do produtor também vale na planilha em massa. É por aqui que a
    // unidade reprecifica dezenas de cursos de uma vez — deixar a validação só
    // na edição individual seria a mesma coisa que não ter validação.
    //
    // UMA leitura para o lote inteiro. Um `findUnique` por item eram 200
    // idas seriais ao pooler antes de a primeira escrita comecar, numa rota que
    // ja limita a concorrencia das escritas de proposito.
    const courseByTc = new Map(owned.map((o) => [o.id, o.courseId]))
    const authoredCourses = await prisma.course.findMany({
      where: { id: { in: [...new Set(owned.map((o) => o.courseId))] } },
      select: AUTHORED_COURSE_SELECT,
    })
    const courseById = new Map(authoredCourses.map((c) => [c.id, c]))
    const priceIssues: { id: string; error: string }[] = []
    for (const it of parsed.data.items) {
      if (it.price === undefined) continue
      const courseId = courseByTc.get(it.id)
      const course = courseId ? courseById.get(courseId) : undefined
      if (!course) continue
      const issue = validateSalePriceForCourse(course, ctx.tenantId, it.price)
      if (issue) priceIssues.push({ id: it.id, error: issue.error })
    }
    if (priceIssues.length > 0) {
      return NextResponse.json(
        {
          error: "Um ou mais preços estão abaixo do mínimo definido pelo produtor.",
          code: "PRICE_BELOW_MINIMUM",
          items: priceIssues,
        },
        { status: 400 },
      )
    }

    // "De" menor ou igual ao preco de venda nao desenha nada na vitrine. Compara
    // contra o preco que VAI valer nesta linha: o do lote quando enviado, senao
    // o gravado (a planilha permite mexer so no "De").
    const priceByTc = new Map(owned.map((o) => [o.id, Number(o.price)]))
    const compareAtIssues: { id: string; error: string }[] = []
    for (const it of parsed.data.items) {
      if (it.precoDe == null) continue
      const precoVenda = it.price ?? priceByTc.get(it.id) ?? 0
      if (precoVenda > 0 && it.precoDe <= precoVenda) {
        compareAtIssues.push({
          id: it.id,
          error: "Preço de tabela precisa ser maior que o preço de venda.",
        })
      }
    }
    if (compareAtIssues.length > 0) {
      return NextResponse.json(
        {
          error:
            'Um ou mais preços de tabela não são maiores que o preço de venda — a vitrine não exibiria o "De".',
          code: "COMPARE_AT_NOT_GREATER",
          items: compareAtIssues,
        },
        { status: 400 },
      )
    }

    // Updates INDIVIDUAIS com concorrência limitada (PERF-013) — NÃO em
    // `$transaction([...])` de lote (que sobre o `@prisma/adapter-pg` + pooler do
    // Supabase falhava e derrubava todo o lote). O update individual é a mesma
    // operação da edição de 1 curso; a concorrência corta o wall-time do lote sem
    // estourar o pool. Cada linha é gravada isoladamente e falhas são reportadas
    // sem abortar as demais.
    let updated = 0
    const failed: { id: string; error: string }[] = []
    const results = await runInChunks(parsed.data.items, BULK_CONCURRENCY, (it) =>
      prisma.tenantCourse.update({
        where: { id: it.id },
        data: {
          ...(it.price !== undefined && { price: it.price }),
          ...(it.precoDe !== undefined && { precoDe: it.precoDe }),
          ...(it.customParcelas !== undefined && {
            customParcelas: it.customParcelas,
          }),
          ...(it.customDescription !== undefined && {
            customDescription: it.customDescription,
          }),
          ...(it.customAprendizado !== undefined && {
            customAprendizado: it.customAprendizado,
          }),
        },
      }),
    )
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        updated++
        return
      }
      const it = parsed.data.items[idx]
      const detail = r.reason instanceof Error ? r.reason.message : String(r.reason)
      failed.push({ id: it.id, error: detail })
      contextLogger().error(
        { err: r.reason, event: "painel.cursos.bulk.row_error", tenantId: ctx.tenantId, id: it.id },
        "falha ao salvar curso na edição em massa da revenda",
      )
    })

    // Nada gravou: devolve erro com o detalhe da 1ª falha (endpoint autenticado).
    if (updated === 0 && failed.length > 0) {
      return NextResponse.json(
        {
          error: "Não foi possível salvar as alterações. Tente novamente.",
          detail: failed[0].error,
        },
        { status: 409 },
      )
    }

    return NextResponse.json({ data: { updated, failed } })
  },
)
