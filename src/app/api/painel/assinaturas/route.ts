import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { countPlanCourses } from "@/lib/subscriptions/plans"
import { ensureUniquePlanSlug } from "@/lib/subscriptions/slug"
import { createPlanSchema } from "@/lib/subscriptions/schema"

/**
 * Planos de assinatura da vitrine da unidade.
 *
 * Duas origens, com poderes diferentes — o mesmo contrato dos pacotes:
 *
 *  - **Da PMB** (`tenantId` null): auto-distribuidos a todas as lojas. A unidade
 *    NAO edita o conteudo (o escopo vale igual em toda a rede); so ajusta preco,
 *    visibilidade e destaque via `TenantSubscriptionPlan`.
 *  - **Proprios** (`tenantId` = a unidade): criados por ela, aparecem SO na
 *    vitrine dela e ela edita tudo.
 */
export const GET = withRequestContext(
  { action: "painel.assinaturas.list", route: "/api/painel/assinaturas" },
  async () => {
    const guard = await requirePainel("assinaturas.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const [pmbPlans, ownPlans, overrides] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        where: { tenantId: null, enabled: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      prisma.subscriptionPlan.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
      prisma.tenantSubscriptionPlan.findMany({ where: { tenantId: ctx.tenantId } }),
    ])

    const byPlan = new Map(overrides.map((o) => [o.planId, o]))

    const pmb = await Promise.all(
      pmbPlans.map(async (p) => {
        const o = byPlan.get(p.id)
        return {
          id: p.id,
          origin: "PMB" as const,
          name: p.name,
          description: p.description,
          suggestedPrice: Number(p.price),
          price: o?.price != null ? Number(o.price) : Number(p.price),
          // A unidade ajusta o PRECO, nunca a periodicidade: a natureza do
          // produto vale igual em toda a rede.
          interval: p.interval,
          isVisible: o?.isVisible ?? true,
          isFeatured: o?.isFeatured ?? p.featured,
          scope: p.scope,
          categoryIds: p.categoryIds,
          packageId: p.packageId,
          courseIds: p.courseIds,
          // Contagem no ESCOPO DA UNIDADE: o mesmo plano libera menos cursos
          // numa vitrine que não vende parte do catálogo.
          courseCount: await countPlanCourses(p, ctx.tenantId),
        }
      }),
    )

    const own = await Promise.all(
      ownPlans.map(async (p) => ({
        id: p.id,
        origin: "OWN" as const,
        name: p.name,
        description: p.description,
        suggestedPrice: Number(p.price),
        price: Number(p.price),
        interval: p.interval,
        isVisible: p.enabled,
        isFeatured: p.featured,
        scope: p.scope,
        categoryIds: p.categoryIds,
        packageId: p.packageId,
        courseIds: p.courseIds,
        courseCount: await countPlanCourses(p, ctx.tenantId),
      })),
    )

    // Próprios primeiro, como na vitrine.
    return NextResponse.json({ data: [...own, ...pmb] })
  },
)

/**
 * Cria um plano PROPRIO da unidade. Aparece so na vitrine dela.
 *
 * O escopo e resolvido contra o catalogo DELA (`planCourseWhere` compoe o gate
 * de `TenantCourse` visivel e com preco), entao um plano "todos os cursos" da
 * unidade libera os cursos QUE ELA VENDE — nunca o catalogo inteiro da rede.
 */
export const POST = withRequestContext(
  { action: "painel.assinaturas.create", route: "/api/painel/assinaturas" },
  async (request: Request) => {
    const guard = await requirePainel("assinaturas.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = createPlanSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const d = parsed.data

    // Pacote do escopo tem que ser vendável NESTA loja: o da própria unidade ou
    // um da PMB. Sem esta checagem, a unidade montaria um plano sobre o pacote
    // de OUTRA revenda e liberaria cursos que não são dela.
    if (d.scope === "PACKAGE" && d.packageId) {
      const pkg = await prisma.coursePackage.findFirst({
        where: {
          id: d.packageId,
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

    const slug = await ensureUniquePlanSlug(ctx.tenantId, d.name)
    const plan = await prisma.subscriptionPlan.create({
      data: {
        tenantId: ctx.tenantId,
        name: d.name,
        slug,
        description: d.description ?? null,
        coverImageUrl: d.coverImageUrl ?? null,
        price: d.price,
        interval: d.interval,
        scope: d.scope,
        categoryIds: d.scope === "CATEGORY" ? d.categoryIds : [],
        packageId: d.scope === "PACKAGE" ? (d.packageId ?? null) : null,
        courseIds: d.scope === "COURSES" ? d.courseIds : [],
        featured: d.featured ?? false,
        enabled: d.enabled ?? true,
        position: d.position ?? 0,
      },
      select: { id: true, slug: true },
    })

    return NextResponse.json({ data: plan }, { status: 201 })
  },
)
