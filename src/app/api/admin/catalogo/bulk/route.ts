import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

/* ------------------------------------------------------------------ */
/* GET — dados enxutos para a edição em massa (planilha) do catálogo   */
/* mãe. Retorna só os campos editáveis em lote: preço de vitrine,      */
/* parcelas (override) e descrição (override).                         */
/* ------------------------------------------------------------------ */
export const GET = withRequestContext(
  { action: "admin.catalogo.bulk.list", route: "/api/admin/catalogo/bulk" },
  async () => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

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
})

const bulkSchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
})

export const PUT = withRequestContext(
  { action: "admin.catalogo.bulk.update", route: "/api/admin/catalogo/bulk" },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
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

    await prisma.$transaction(
      parsed.data.items.map((it) =>
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
          },
        }),
      ),
    )

    return NextResponse.json({ data: { updated: parsed.data.items.length } })
  },
)
