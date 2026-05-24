import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"

export async function GET() {
  const guard = await requireSuperAdmin()
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
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: { planValue: true },
    }),
    prisma.tenant.count({ where: { status: "CANCELLED" } }),
    prisma.tenant.count(),
    prisma.tenant.aggregate({
      _sum: { planValue: true },
      where: { status: "ACTIVE" },
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
}
