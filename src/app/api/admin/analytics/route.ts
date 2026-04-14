import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

const PERIODS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
} as const

type Period = keyof typeof PERIODS

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function subDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() - n)
  return c
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const periodParam = (url.searchParams.get("period") ?? "30d") as Period
  const days = PERIODS[periodParam] ?? 30
  const since = startOfDay(subDays(new Date(), days))

  const [
    newResellers,
    newStudents,
    enrollmentsInPeriod,
    approvedPaymentsInPeriod,
    activeTenants,
    totalTenants,
    cancelledTenants,
    activeMrrAgg,
    revenueByMonth,
    studentsByMonth,
    distributionByPlanRows,
    rankingMrr,
    rankingStudents,
  ] = await Promise.all([
    prisma.tenant.count({ where: { createdAt: { gte: since } } }),
    prisma.student.count({ where: { createdAt: { gte: since } } }),
    prisma.enrollment.count({ where: { createdAt: { gte: since } } }),
    prisma.payment.count({
      where: { mpStatus: "APPROVED", createdAt: { gte: since } },
    }),
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: "CANCELLED" } }),
    prisma.tenant.aggregate({
      where: { status: "ACTIVE" },
      _sum: { planValue: true },
    }),
    prisma.payment.findMany({
      where: { mpStatus: "APPROVED", createdAt: { gte: subDays(new Date(), 180) } },
      select: { amount: true, createdAt: true },
    }),
    prisma.enrollment.findMany({
      where: { createdAt: { gte: subDays(new Date(), 180) } },
      select: { createdAt: true },
    }),
    prisma.tenant.groupBy({
      by: ["planValue"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true, planValue: true },
      orderBy: { planValue: "desc" },
      take: 10,
    }),
    prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { students: true } },
      },
      orderBy: { students: { _count: "desc" } },
      take: 10,
    }),
  ])

  const conversionRate = enrollmentsInPeriod > 0
    ? (approvedPaymentsInPeriod / enrollmentsInPeriod) * 100
    : 0
  const mrr = Number(activeMrrAgg._sum?.planValue ?? 0)
  const avgMrr = activeTenants > 0 ? mrr / activeTenants : 0
  const churn = totalTenants > 0 ? (cancelledTenants / totalTenants) * 100 : 0
  const ltv = avgMrr * 24

  const months: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(monthKey(d))
  }

  const revenueMap = new Map<string, number>(months.map((m) => [m, 0]))
  for (const p of revenueByMonth) {
    const k = monthKey(p.createdAt)
    if (revenueMap.has(k)) {
      revenueMap.set(k, (revenueMap.get(k) ?? 0) + Number(p.amount))
    }
  }

  const studentsMap = new Map<string, number>(months.map((m) => [m, 0]))
  for (const e of studentsByMonth) {
    const k = monthKey(e.createdAt)
    if (studentsMap.has(k)) {
      studentsMap.set(k, (studentsMap.get(k) ?? 0) + 1)
    }
  }

  const distribution = distributionByPlanRows.map((row) => ({
    label: `R$ ${Number(row.planValue).toFixed(0)}`,
    value: row._count._all,
  }))

  return NextResponse.json({
    data: {
      kpis: {
        newResellers,
        newStudents,
        conversionRate,
        avgMrr,
        churn,
        ltv,
      },
      charts: {
        months,
        revenueByMonth: months.map((m) => revenueMap.get(m) ?? 0),
        studentsByMonth: months.map((m) => studentsMap.get(m) ?? 0),
        conversionByMonth: months.map(() =>
          Number(conversionRate.toFixed(1)),
        ),
        distribution,
      },
      rankings: {
        mrr: rankingMrr.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          value: Number(t.planValue),
        })),
        students: rankingStudents.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          value: t._count.students,
        })),
      },
      period: periodParam,
    },
  })
}
