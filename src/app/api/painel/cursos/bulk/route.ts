import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

/* ------------------------------------------------------------------ */
/* GET — dados enxutos para a edição em massa (planilha)               */
/* Retorna apenas os campos editáveis em lote: preço, parcelas sem     */
/* juros (informativo) e descrição customizada.                        */
/* ------------------------------------------------------------------ */
export const GET = withRequestContext(
  { action: "painel.cursos.bulk.list", route: "/api/painel/cursos/bulk" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

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
      })),
    })
  },
)

/* ------------------------------------------------------------------ */
/* PUT — atualização em lote                                            */
/* Aceita só os 3 campos da planilha. Não toca em paymentType,         */
/* visibilidade, destaque, capa, etc.                                  */
/* ------------------------------------------------------------------ */
const itemSchema = z.object({
  id: z.string().min(1),
  price: z.number().positive("Preço deve ser maior que zero").optional(),
  customParcelas: z.number().int().min(1).max(24).nullable().optional(),
  customDescription: z.string().trim().max(2000).nullable().optional(),
})

const bulkSchema = z.object({
  items: z.array(itemSchema).min(1).max(200),
})

export const PUT = withRequestContext(
  { action: "painel.cursos.bulk.update", route: "/api/painel/cursos/bulk" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

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

    // Updates SEQUENCIAIS (não em `$transaction` de lote). O `$transaction([...])`
    // sobre o `@prisma/adapter-pg` + pooler do Supabase falhava e derrubava todo
    // o lote; o update individual (mesma operação da edição de 1 curso) funciona.
    // Trocamos atomicidade por robustez: cada linha é gravada isoladamente e as
    // que falharem são reportadas sem abortar as demais.
    let updated = 0
    const failed: { id: string; error: string }[] = []
    for (const it of parsed.data.items) {
      try {
        await prisma.tenantCourse.update({
          where: { id: it.id },
          data: {
            ...(it.price !== undefined && { price: it.price }),
            ...(it.customParcelas !== undefined && {
              customParcelas: it.customParcelas,
            }),
            ...(it.customDescription !== undefined && {
              customDescription: it.customDescription,
            }),
          },
        })
        updated++
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        failed.push({ id: it.id, error: detail })
        contextLogger().error(
          { err, event: "painel.cursos.bulk.row_error", tenantId: ctx.tenantId, id: it.id },
          "falha ao salvar curso na edição em massa da revenda",
        )
      }
    }

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
