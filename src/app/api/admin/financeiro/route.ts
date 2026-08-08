import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { CHURN_BASE_WHERE } from "@/lib/tenants/lifecycle"

export const GET = withRequestContext(
  { action: "admin.financeiro.get", route: "/api/admin/financeiro" },
  async () => {
  const guard = await requireAdmin("financeiro.viewAll")
  if (!guard.ok) return guard.response

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(now.getDate() - 60)

  const [
    activeTenants,
    cancelledTenants,
    totalTenants,
    mrrAgg,
    paidLast30Agg,
    paidPrev30Agg,
    payments,
  ] = await Promise.all([
    // Apenas revendas PAGANTES (planValue > 0). Cortesias/grátis e a PMB
    // (planValue 0) não geram receita e não devem entrar em MRR/ARR/churn/LTV.
    prisma.tenant.findMany({
      where: { status: "ACTIVE", planValue: { gt: 0 } },
      select: { planValue: true },
    }),
    // Churn conta só quem chegou a ser cliente pagante — `planValue > 0` é o
    // valor de HOJE e não distingue "nunca pagou" de "pagava e saiu". Mesma
    // fonte que a aba Financeiro do relatório (`lib/tenants/lifecycle.ts`).
    prisma.tenant.count({ where: { ...CHURN_BASE_WHERE, status: "CANCELLED" } }),
    prisma.tenant.count({ where: CHURN_BASE_WHERE }),
    prisma.tenant.aggregate({
      _sum: { planValue: true },
      where: { status: "ACTIVE", planValue: { gt: 0 } },
    }),
    prisma.tenantPayment.aggregate({
      _sum: { amount: true },
      where: {
        status: { in: ["RECEIVED", "CONFIRMED"] },
        paidAt: { gte: thirtyDaysAgo, lte: now },
      },
    }),
    prisma.tenantPayment.aggregate({
      _sum: { amount: true },
      where: {
        status: { in: ["RECEIVED", "CONFIRMED"] },
        paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    prisma.tenantPayment.findMany({
      select: {
        id: true,
        amount: true,
        billingType: true,
        status: true,
        dueDate: true,
        paidAt: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ])

  const mrr = Number(mrrAgg._sum?.planValue ?? 0)
  const arr = mrr * 12
  const churnRate = totalTenants > 0 ? (cancelledTenants / totalTenants) * 100 : 0

  const paidLast30 = Number(paidLast30Agg._sum?.amount ?? 0)
  const paidPrev30 = Number(paidPrev30Agg._sum?.amount ?? 0)
  const paidChangePct =
    paidPrev30 > 0
      ? ((paidLast30 - paidPrev30) / paidPrev30) * 100
      : paidLast30 > 0
        ? 100
        : 0

  const avgTicket =
    activeTenants.length > 0
      ? mrr / activeTenants.length
      : 0
  const ltv = avgTicket * 24

  return NextResponse.json({
    data: {
      summary: {
        mrr,
        arr,
        churnRate,
        ltv,
        paidLast30,
        paidChangePct,
        activeCount: activeTenants.length,
        cancelledCount: cancelledTenants,
      },
      payments: payments.map((p) => ({
        id: p.id,
        tenantId: p.tenant.id,
        tenantName: p.tenant.name,
        tenantSlug: p.tenant.slug,
        amount: Number(p.amount),
        billingType: p.billingType,
        status: p.status,
        dueDate: p.dueDate.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    },
  })
  },
)
