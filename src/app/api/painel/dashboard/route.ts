import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  const last30 = new Date(now)
  last30.setDate(last30.getDate() - 29)
  last30.setHours(0, 0, 0, 0)

  const [
    monthAgg,
    lastMonthAgg,
    studentsMonth,
    studentsLastMonth,
    leadsMonth,
    enrollmentsMonthCount,
    dailyRevenue,
    recentSales,
  ] = await Promise.all([
    prisma.enrollment.aggregate({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { finalAmount: true },
      _count: { _all: true },
    }),
    prisma.enrollment.aggregate({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { finalAmount: true },
      _count: { _all: true },
    }),
    prisma.student.count({
      where: { tenantId: ctx.tenantId, createdAt: { gte: startOfMonth } },
    }),
    prisma.student.count({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
    }),
    prisma.lead.count({
      where: { tenantId: ctx.tenantId, createdAt: { gte: startOfMonth } },
    }),
    prisma.enrollment.count({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.$queryRaw<Array<{ day: Date; revenue: number }>>`
      SELECT date_trunc('day', "created_at") AS day,
             COALESCE(SUM("final_amount")::float, 0) AS revenue
      FROM "enrollments"
      WHERE "tenant_id" = ${ctx.tenantId}
        AND status IN ('ACTIVE', 'COMPLETED')
        AND "created_at" >= ${last30}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.enrollment.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        finalAmount: true,
        status: true,
        createdAt: true,
        student: { select: { nome: true } },
        course: { select: { nome: true } },
      },
    }),
  ])

  const monthRevenue = Number(monthAgg._sum.finalAmount ?? 0)
  const lastMonthRevenue = Number(lastMonthAgg._sum.finalAmount ?? 0)
  const revenueChange = lastMonthRevenue > 0
    ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : null
  const studentsChange = studentsLastMonth > 0
    ? ((studentsMonth - studentsLastMonth) / studentsLastMonth) * 100
    : null

  const conversionBase = leadsMonth + studentsMonth
  const conversionRate = conversionBase > 0
    ? (studentsMonth / conversionBase) * 100
    : null

  const ticketAverage = monthAgg._count._all > 0
    ? monthRevenue / monthAgg._count._all
    : 0

  const dailyMap = new Map<string, number>()
  for (const row of dailyRevenue) {
    const key = new Date(row.day).toISOString().slice(0, 10)
    dailyMap.set(key, Number(row.revenue))
  }
  const revenueChart: Array<{ date: string; revenue: number }> = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(last30)
    d.setDate(last30.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    revenueChart.push({ date: key, revenue: dailyMap.get(key) ?? 0 })
  }

  return NextResponse.json({
    data: {
      metrics: {
        monthlyRevenue: monthRevenue,
        monthlyRevenueChange: revenueChange,
        monthlyStudents: studentsMonth,
        monthlyStudentsChange: studentsChange,
        conversionRate,
        ticketAverage,
        enrollmentsCount: enrollmentsMonthCount,
      },
      revenueChart,
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        studentName: sale.student.nome,
        courseName: sale.course.nome,
        amount: Number(sale.finalAmount),
        status: sale.status,
        createdAt: sale.createdAt.toISOString(),
      })),
    },
  })
}
