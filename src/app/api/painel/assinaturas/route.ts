import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { countPlanCourses } from "@/lib/subscriptions/plans"

/**
 * Planos que a unidade pode vender: os da PMB (auto-distribuidos) com o
 * override dela aplicado. A unidade NAO cria plano proprio nem edita o conteudo
 * de um plano da PMB — so preco, visibilidade e destaque, como nos pacotes.
 */
export const GET = withRequestContext(
  { action: "painel.assinaturas.list", route: "/api/painel/assinaturas" },
  async () => {
    const guard = await requirePainel("assinaturas.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const plans = await prisma.subscriptionPlan.findMany({
      where: { tenantId: null, enabled: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    })

    const overrides = await prisma.tenantSubscriptionPlan.findMany({
      where: { tenantId: ctx.tenantId, planId: { in: plans.map((p) => p.id) } },
    })
    const byPlan = new Map(overrides.map((o) => [o.planId, o]))

    const data = await Promise.all(
      plans.map(async (p) => {
        const o = byPlan.get(p.id)
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          suggestedPrice: Number(p.price),
          price: o?.price != null ? Number(o.price) : Number(p.price),
          isVisible: o?.isVisible ?? true,
          isFeatured: o?.isFeatured ?? p.featured,
          // Contagem no ESCOPO DA UNIDADE: o mesmo plano libera menos cursos
          // numa vitrine que não vende parte do catálogo.
          courseCount: await countPlanCourses(p, ctx.tenantId),
        }
      }),
    )

    return NextResponse.json({ data })
  },
)
