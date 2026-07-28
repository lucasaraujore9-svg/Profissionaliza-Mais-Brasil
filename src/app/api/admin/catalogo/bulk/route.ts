import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { runInChunks } from "@/lib/concurrency"
import {
  APRENDIZADO_MAX_ITEMS,
  APRENDIZADO_MAX_LEN,
} from "@/lib/courses/aprendizado"
import { requireAdmin } from "@/lib/auth/admin-guard"

// PERF-013: nº de updates individuais concorrentes por lote (corta o wall-time
// de lotes grandes sem estourar o pool do Supabase).
const BULK_CONCURRENCY = 10

/* ------------------------------------------------------------------ */
/* GET — dados enxutos para a edição em massa (planilha) do catálogo   */
/* mãe. Retorna só os campos editáveis em lote: preço de vitrine,      */
/* parcelas (override) e descrição (override).                         */
/* ------------------------------------------------------------------ */
export const GET = withRequestContext(
  { action: "admin.catalogo.bulk.list", route: "/api/admin/catalogo/bulk" },
  async () => {
    const guard = await requireAdmin("catalogo.view")
    if (!guard.ok) return guard.response

    const courses = await prisma.course.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        paymentTypeMain: true,
        parcelasOverride: true,
        parcelasSugeridas: true,
        descricaoOverride: true,
        descricao: true,
        aprendizado: true,
      },
    })

    return NextResponse.json({
      data: courses.map((c) => ({
        id: c.id,
        title: c.nome,
        price: Number(
          c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0,
        ),
        paymentType: c.paymentTypeMain,
        customParcelas: c.parcelasOverride,
        defaultParcelas: c.parcelasSugeridas,
        customDescription: c.descricaoOverride,
        defaultDescription: c.descricao,
        // No catálogo mãe não há camada acima: o que está gravado JÁ é o padrão
        // herdado pelas revendas — por isso os dois campos apontam pro mesmo.
        customAprendizado: c.aprendizado,
        defaultAprendizado: c.aprendizado,
      })),
    })
  },
)

/* ------------------------------------------------------------------ */
/* PUT — atualização em lote do catálogo mãe                            */
/* Aceita o mesmo contrato da edição em massa do painel (price,        */
/* customParcelas, customDescription) e mapeia para os campos do       */
/* catálogo: precoVitrineMain, parcelasOverride, descricaoOverride.    */
/* ------------------------------------------------------------------ */
const itemSchema = z.object({
  id: z.string().min(1),
  price: z.number().positive("Preço deve ser maior que zero").optional(),
  customParcelas: z.number().int().min(1).max(24).nullable().optional(),
  customDescription: z.string().trim().max(2000).nullable().optional(),
  // Vira Course.aprendizado — o padrão herdado por TODAS as vitrines.
  customAprendizado: z
    .array(z.string().trim().min(1).max(APRENDIZADO_MAX_LEN))
    .max(APRENDIZADO_MAX_ITEMS)
    .optional(),
})

const bulkSchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
})

export const PUT = withRequestContext(
  { action: "admin.catalogo.bulk.update", route: "/api/admin/catalogo/bulk" },
  async (request: Request) => {
    const guard = await requireAdmin("catalogo.manage")
    if (!guard.ok) return guard.response

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

    // Garante que todos os ids existem no catálogo antes de atualizar.
    const ids = parsed.data.items.map((it) => it.id)
    const existing = await prisma.course.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((c) => c.id))
    const missing = ids.filter((id) => !existingIds.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Um ou mais cursos não foram encontrados no catálogo." },
        { status: 404 },
      )
    }

    // Updates INDIVIDUAIS com concorrência limitada (PERF-013) — NÃO em
    // `$transaction([...])` de lote (que sobre o `@prisma/adapter-pg` + pooler do
    // Supabase derrubava o lote inteiro). Cada curso é gravado isoladamente;
    // falhas são reportadas por linha sem abortar o resto. A concorrência corta o
    // wall-time de um lote grande (até 500 itens) sem estourar o pool.
    let updated = 0
    const failed: { id: string; error: string }[] = []
    const results = await runInChunks(parsed.data.items, BULK_CONCURRENCY, (it) =>
      prisma.course.update({
        where: { id: it.id },
        data: {
          ...(it.price !== undefined && { precoVitrineMain: it.price }),
          ...(it.customParcelas !== undefined && {
            parcelasOverride: it.customParcelas,
          }),
          ...(it.customDescription !== undefined && {
            descricaoOverride: it.customDescription,
          }),
          ...(it.customAprendizado !== undefined && {
            aprendizado: it.customAprendizado,
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
        { err: r.reason, event: "admin.catalogo.bulk.row_error", id: it.id },
        "falha ao salvar curso na edição em massa do catálogo",
      )
    })

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
