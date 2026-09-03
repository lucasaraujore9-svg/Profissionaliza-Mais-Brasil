import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { ensureUniquePlanSlug } from "@/lib/subscriptions/slug"
import { createPlanSchema } from "@/lib/subscriptions/schema"
import { countPlanCourses } from "@/lib/subscriptions/plans"

/* ------------------------------------------------------------------ */
/* GET — lista os planos da PMB (tenant_id = null)                     */
/* ------------------------------------------------------------------ */
export const GET = withRequestContext(
  { action: "admin.assinaturas.list", route: "/api/admin/assinaturas" },
  async () => {
    const guard = await requireAdmin("assinaturas.view")
    if (!guard.ok) return guard.response

    const plans = await prisma.subscriptionPlan.findMany({
      where: { tenantId: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    })

    // A contagem é resolvida AGORA, contra o catálogo de agora: é o número que
    // mostra ao admin o efeito real do escopo que ele escolheu (um plano por
    // categoria muda de tamanho sozinho quando entra curso novo).
    const data = await Promise.all(
      plans.map(async (p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        price: Number(p.price),
        interval: p.interval,
        scope: p.scope,
        categoryIds: p.categoryIds,
        packageId: p.packageId,
        courseIds: p.courseIds,
        featured: p.featured,
        enabled: p.enabled,
        position: p.position,
        courseCount: await countPlanCourses(p, null),
      })),
    )

    return NextResponse.json({ data })
  },
)

/* ------------------------------------------------------------------ */
/* POST — cria um plano da PMB                                          */
/* ------------------------------------------------------------------ */
export const POST = withRequestContext(
  { action: "admin.assinaturas.create", route: "/api/admin/assinaturas" },
  async (request: Request) => {
    const guard = await requireAdmin("assinaturas.manage")
    if (!guard.ok) return guard.response

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

    const slug = await ensureUniquePlanSlug(null, d.name)
    const plan = await prisma.subscriptionPlan.create({
      data: {
        tenantId: null,
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
        createdByUserId: guard.ctx.userId,
        createdByRole: guard.ctx.role,
      },
    })

    return NextResponse.json({ data: { id: plan.id, slug: plan.slug } }, { status: 201 })
  },
)
