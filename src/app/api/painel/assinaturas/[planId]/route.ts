import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const patchSchema = z.object({
  price: z.number().positive("Preço deve ser maior que zero").nullable().optional(),
  isVisible: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
})

/**
 * Override da unidade sobre um plano da PMB: preco proprio, ocultar da vitrine
 * dela e destacar. NUNCA altera o conteudo do plano — o escopo (categorias,
 * pacote, cursos) e da PMB e vale igual em todas as vitrines.
 */
export const PATCH = withRequestContextParams<{ planId: string }>(
  { action: "painel.assinaturas.override", route: "/api/painel/assinaturas/[planId]" },
  async (request: Request, { params }) => {
    const guard = await requirePainel("assinaturas.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { planId } = await params

    // Só plano da PMB: um plano de OUTRA unidade não é sobrescritível aqui.
    const pmbPlan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, tenantId: null },
      select: { id: true },
    })
    if (!pmbPlan) {
      return NextResponse.json(
        { error: "Plano da PMB não encontrado", code: "NOT_PMB_PLAN" },
        { status: 404 },
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const d = parsed.data

    const saved = await prisma.tenantSubscriptionPlan.upsert({
      where: { tenantId_planId: { tenantId: ctx.tenantId, planId } },
      create: {
        tenantId: ctx.tenantId,
        planId,
        price: d.price ?? null,
        isVisible: d.isVisible ?? true,
        isFeatured: d.isFeatured ?? false,
      },
      update: {
        ...(d.price !== undefined ? { price: d.price } : {}),
        ...(d.isVisible !== undefined ? { isVisible: d.isVisible } : {}),
        ...(d.isFeatured !== undefined ? { isFeatured: d.isFeatured } : {}),
      },
      select: { price: true, isVisible: true, isFeatured: true },
    })

    return NextResponse.json({
      data: {
        price: saved.price != null ? Number(saved.price) : null,
        isVisible: saved.isVisible,
        isFeatured: saved.isFeatured,
      },
    })
  },
)
