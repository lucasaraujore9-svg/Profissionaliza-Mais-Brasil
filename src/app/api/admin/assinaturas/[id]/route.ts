import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { ensureUniquePlanSlug } from "@/lib/subscriptions/slug"
import {
  updatePlanSchema,
  scopeIsComplete,
  SCOPE_INCOMPLETE_MESSAGE,
} from "@/lib/subscriptions/schema"

/* ------------------------------------------------------------------ */
/* PATCH — edita um plano da PMB                                        */
/* ------------------------------------------------------------------ */
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.assinaturas.update", route: "/api/admin/assinaturas/[id]" },
  async (request: Request, { params }) => {
    const guard = await requireAdmin("assinaturas.manage")
    if (!guard.ok) return guard.response

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = updatePlanSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const d = parsed.data

    const current = await prisma.subscriptionPlan.findFirst({
      where: { id, tenantId: null },
    })
    if (!current) {
      return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })
    }

    // A completude é checada sobre o estado RESULTANTE, não sobre o payload:
    // trocar só o `scope` para CATEGORY, sem mandar categoria, produziria um
    // plano que não libera nada — e o resolvedor é fail-closed, então o aluno
    // pagaria por um catálogo vazio.
    const next = {
      scope: d.scope ?? current.scope,
      categoryIds: d.categoryIds ?? current.categoryIds,
      packageId: d.packageId !== undefined ? d.packageId : current.packageId,
      courseIds: d.courseIds ?? current.courseIds,
    }
    if (!scopeIsComplete(next)) {
      return NextResponse.json(
        { error: SCOPE_INCOMPLETE_MESSAGE, fields: { scope: [SCOPE_INCOMPLETE_MESSAGE] } },
        { status: 400 },
      )
    }

    const updated = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(d.name ? { name: d.name, slug: await ensureUniquePlanSlug(null, d.name, id) } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.coverImageUrl !== undefined ? { coverImageUrl: d.coverImageUrl } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        // Alcanca so contratacoes NOVAS: `StudentSubscription.interval` e
        // congelado na compra, entao quem ja assina segue no ciclo dele.
        ...(d.interval !== undefined ? { interval: d.interval } : {}),
        scope: next.scope,
        // Campos de escopo são zerados fora do seu modo: um plano que já foi
        // CATEGORY e virou COURSES não pode carregar as categorias antigas —
        // elas voltariam a valer se alguém devolvesse o escopo depois.
        categoryIds: next.scope === "CATEGORY" ? next.categoryIds : [],
        packageId: next.scope === "PACKAGE" ? next.packageId : null,
        courseIds: next.scope === "COURSES" ? next.courseIds : [],
        ...(d.featured !== undefined ? { featured: d.featured } : {}),
        ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
        ...(d.position !== undefined ? { position: d.position } : {}),
      },
      select: { id: true, slug: true },
    })

    return NextResponse.json({ data: updated })
  },
)

/* ------------------------------------------------------------------ */
/* DELETE — remove um plano da PMB                                      */
/* ------------------------------------------------------------------ */
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.assinaturas.delete", route: "/api/admin/assinaturas/[id]" },
  async (_request: Request, { params }) => {
    const guard = await requireAdmin("assinaturas.manage")
    if (!guard.ok) return guard.response

    const { id } = await params

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id, tenantId: null },
      select: { id: true },
    })
    if (!plan) {
      return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })
    }

    // Conta TODAS as assinaturas, não só as vivas. Duas razões:
    //  1. `student_subscriptions.plan_id` é NOT NULL sem ON DELETE, então
    //     apagar um plano com assinante CANCELADO estourava violação de FK e
    //     o handler devolvia 500 genérico.
    //  2. A assinatura cancelada é histórico financeiro (SubscriptionPayment
    //     pendura nela) — apagar o plano apagaria o nome do que foi vendido.
    const total = await prisma.studentSubscription.count({ where: { planId: id } })
    if (total > 0) {
      const live = await prisma.studentSubscription.count({
        where: { planId: id, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } },
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

    await prisma.subscriptionPlan.delete({ where: { id } })
    return NextResponse.json({ data: { ok: true } })
  },
)
