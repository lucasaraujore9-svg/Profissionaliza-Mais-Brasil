import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { runInChunks } from "@/lib/concurrency"
import {
  APRENDIZADO_MAX_ITEMS,
  APRENDIZADO_MAX_LEN,
} from "@/lib/courses/aprendizado"

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
  customParcelas: z.number().int().min(1).max(24).nullable().optional(),
  customDescription: z.string().trim().max(2000).nullable().optional(),
  // Lista vazia = volta ao padrão definido pela PMB no catálogo mãe.
  customAprendizado: z
    .array(z.string().trim().min(1).max(APRENDIZADO_MAX_LEN))
    .max(APRENDIZADO_MAX_ITEMS)
    .optional(),
})

const bulkSchema = z.object({
  items: z.array(itemSchema).min(1).max(200),
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
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Garante que TODOS os cursos pertencem ao tenant (anti cross-tenant).
    const ids = parsed.data.items.map((it) => it.id)
    const owned = await prisma.tenantCourse.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
      select: { id: true },
    })
    const ownedIds = new Set(owned.map((o) => o.id))
    const foreign = ids.filter((id) => !ownedIds.has(id))
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: "Um ou mais cursos não pertencem à sua unidade." },
        { status: 403 },
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
