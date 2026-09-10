import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSubscriptionModule } from "@/lib/subscriptions/module-gate"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { ensureUniquePlanSlug } from "@/lib/subscriptions/slug"
import {
  updatePlanSchema,
  scopeIsComplete,
  SCOPE_INCOMPLETE_MESSAGE,
} from "@/lib/subscriptions/schema"

/** Override da unidade sobre um plano da PMB: so o que e negocio DELA. */
const overrideSchema = z.object({
  price: z.number().positive("Preço deve ser maior que zero").nullable().optional(),
  isVisible: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
})

/**
 * PATCH com DOIS comportamentos, decididos pela ORIGEM do plano:
 *
 *  - **Plano da PMB**: grava `TenantSubscriptionPlan` (preco, visibilidade,
 *    destaque). NUNCA altera o plano em si — o escopo e da PMB e vale igual em
 *    todas as lojas; deixar a unidade editar mudaria o produto da rede inteira.
 *  - **Plano proprio**: edita o registro direto, como o admin faz com os dele.
 */
export const PATCH = withRequestContextParams<{ planId: string }>(
  { action: "painel.assinaturas.update", route: "/api/painel/assinaturas/[planId]" },
  async (request: Request, { params }) => {
    const guard = await requireSubscriptionModule("assinaturas.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { planId } = await params

    // Escopo: só plano da PMB ou da PRÓPRIA unidade. O de outra revenda não
    // existe para esta loja — 404, não 403, para não confirmar que ele existe.
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] },
    })
    if (!plan) {
      return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    // ── Plano da PMB: só override ──
    if (plan.tenantId === null) {
      const parsed = overrideSchema.safeParse(payload)
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
    }

    // ── Plano próprio: edição completa ──
    const parsed = updatePlanSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const d = parsed.data

    // Completude sobre o estado RESULTANTE: trocar só o `scope` para CATEGORY,
    // sem mandar categoria, produziria um plano que não libera nada — e o
    // resolvedor é fail-closed, então o aluno pagaria por um catálogo vazio.
    const next = {
      scope: d.scope ?? plan.scope,
      categoryIds: d.categoryIds ?? plan.categoryIds,
      packageId: d.packageId !== undefined ? d.packageId : plan.packageId,
      courseIds: d.courseIds ?? plan.courseIds,
    }
    if (!scopeIsComplete(next)) {
      return NextResponse.json(
        { error: SCOPE_INCOMPLETE_MESSAGE, fields: { scope: [SCOPE_INCOMPLETE_MESSAGE] } },
        { status: 400 },
      )
    }

    if (next.scope === "PACKAGE" && next.packageId) {
      const pkg = await prisma.coursePackage.findFirst({
        where: {
          id: next.packageId,
          enabled: true,
          OR: [{ tenantId: null }, { tenantId: ctx.tenantId }],
        },
        select: { id: true },
      })
      if (!pkg) {
        return NextResponse.json(
          { error: "Pacote inválido para esta loja", code: "INVALID_PACKAGE" },
          { status: 400 },
        )
      }
    }

    const updated = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...(d.name
          ? { name: d.name, slug: await ensureUniquePlanSlug(ctx.tenantId, d.name, planId) }
          : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.coverImageUrl !== undefined ? { coverImageUrl: d.coverImageUrl } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        // So vale para contratacoes NOVAS — o ciclo de quem ja assina esta
        // congelado em `StudentSubscription.interval`.
        ...(d.interval !== undefined ? { interval: d.interval } : {}),
        scope: next.scope,
        // Campos de escopo zerados fora do seu modo: um plano que foi CATEGORY
        // e virou COURSES não pode carregar as categorias antigas — elas
        // voltariam a valer se alguém devolvesse o escopo depois.
        categoryIds: next.scope === "CATEGORY" ? next.categoryIds : [],
        packageId: next.scope === "PACKAGE" ? next.packageId : null,
        courseIds: next.scope === "COURSES" ? next.courseIds : [],
        ...(d.featured !== undefined ? { featured: d.featured } : {}),
        ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
      },
      select: { id: true, slug: true },
    })

    return NextResponse.json({ data: updated })
  },
)

/** Remove um plano PROPRIO. Plano da PMB nao se apaga — se oculta. */
export const DELETE = withRequestContextParams<{ planId: string }>(
  { action: "painel.assinaturas.delete", route: "/api/painel/assinaturas/[planId]" },
  async (_request: Request, { params }) => {
    const guard = await requireSubscriptionModule("assinaturas.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { planId } = await params

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!plan) {
      // Inclui o caso "plano da PMB": ela não é dona, então não apaga.
      return NextResponse.json(
        {
          error:
            "Só é possível excluir planos criados por você. Planos da PMB podem ser ocultados da sua vitrine.",
        },
        { status: 404 },
      )
    }

    // Assinante (mesmo cancelado) impede a remoção: o `plan_id` é NOT NULL sem
    // ON DELETE — apagar estouraria FK — e a assinatura encerrada é histórico
    // financeiro, que perderia o nome do que foi vendido.
    const total = await prisma.studentSubscription.count({ where: { planId } })
    if (total > 0) {
      const live = await prisma.studentSubscription.count({
        where: { planId, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } },
      })
      return NextResponse.json(
        {
          error:
            live > 0
              ? `Este plano tem ${live} assinatura(s) ativa(s). Desative-o em vez de excluir.`
              : `Este plano já teve ${total} assinatura(s) e faz parte do histórico. Desative-o em vez de excluir.`,
        },
        { status: 409 },
      )
    }

    await prisma.subscriptionPlan.delete({ where: { id: planId } })
    return NextResponse.json({ data: { ok: true } })
  },
)
