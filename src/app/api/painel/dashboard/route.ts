import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export type DashboardPeriod = "today" | "7d" | "30d" | "90d" | "12m"

const VALID_PERIODS: DashboardPeriod[] = ["today", "7d", "30d", "90d", "12m"]

type Bucket = "hour" | "day" | "week" | "month"

interface PeriodConfig {
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
  bucket: Bucket
  /** number of buckets the chart should render (preenche zeros para dias/horas sem venda) */
  bucketCount: number
}

function buildPeriod(period: DashboardPeriod, now: Date): PeriodConfig {
  const end = new Date(now)
  let start: Date
  let bucket: Bucket
  let bucketCount: number

  switch (period) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      bucket = "hour"
      bucketCount = 24
      break
    }
    case "7d": {
      start = new Date(now)
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      bucket = "day"
      bucketCount = 7
      break
    }
    case "30d": {
      start = new Date(now)
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      bucket = "day"
      bucketCount = 30
      break
    }
    case "90d": {
      start = new Date(now)
      start.setDate(start.getDate() - 89)
      start.setHours(0, 0, 0, 0)
      bucket = "week"
      bucketCount = 13
      break
    }
    case "12m": {
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0)
      bucket = "month"
      bucketCount = 12
      break
    }
  }

  const periodMs = end.getTime() - start.getTime()
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(start.getTime() - periodMs)

  return { start, end, previousStart, previousEnd, bucket, bucketCount }
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

export const GET = withRequestContext(
  { action: "painel.dashboard.get", route: "/api/painel/dashboard" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodRaw = (searchParams.get("period") ?? "30d") as DashboardPeriod
    const period: DashboardPeriod = VALID_PERIODS.includes(periodRaw) ? periodRaw : "30d"

    const now = new Date()
    const cfg = buildPeriod(period, now)

    const [
      revenueAgg,
      revenuePrevAgg,
      studentsCount,
      studentsPrevCount,
      enrollmentsTotal,
      enrollmentsApproved,
      chartRows,
      recentSales,
    ] = await Promise.all([
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          tenantId: ctx.tenantId,
          mpStatus: "APPROVED",
          paidAt: { gte: cfg.start, lte: cfg.end },
        },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          tenantId: ctx.tenantId,
          mpStatus: "APPROVED",
          paidAt: { gte: cfg.previousStart, lte: cfg.previousEnd },
        },
      }),
      prisma.student.count({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: cfg.start, lte: cfg.end },
        },
      }),
      prisma.student.count({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: cfg.previousStart, lte: cfg.previousEnd },
        },
      }),
      prisma.enrollment.count({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: cfg.start, lte: cfg.end },
        },
      }),
      prisma.enrollment.count({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["ACTIVE", "COMPLETED"] },
          createdAt: { gte: cfg.start, lte: cfg.end },
        },
      }),
      prisma.$queryRawUnsafe<Array<{ bucket: Date; revenue: number }>>(
        `SELECT date_trunc($1, paid_at) AS bucket,
                COALESCE(SUM(amount)::float, 0) AS revenue
         FROM payments
         WHERE tenant_id = $2
           AND mp_status = 'APPROVED'
           AND paid_at >= $3
           AND paid_at <= $4
         GROUP BY bucket
         ORDER BY bucket ASC`,
        cfg.bucket,
        ctx.tenantId,
        cfg.start,
        cfg.end,
      ),
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

    const revenue = Number(revenueAgg._sum.amount ?? 0)
    const revenuePrev = Number(revenuePrevAgg._sum.amount ?? 0)
    const revenueChange = pctChange(revenue, revenuePrev)
    const studentsChange = pctChange(studentsCount, studentsPrevCount)

    const conversionRate = enrollmentsTotal > 0
      ? (enrollmentsApproved / enrollmentsTotal) * 100
      : null

    const ticketAverage = enrollmentsApproved > 0
      ? revenue / enrollmentsApproved
      : 0

    const chart = buildChartSeries(cfg, chartRows)

    return NextResponse.json({
      data: {
        period,
        range: {
          start: cfg.start.toISOString(),
          end: cfg.end.toISOString(),
        },
        metrics: {
          revenue,
          revenueChange,
          students: studentsCount,
          studentsChange,
          conversionRate,
          ticketAverage,
          enrollmentsApproved,
          enrollmentsTotal,
        },
        revenueChart: chart,
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
  },
)

interface ChartPoint {
  date: string
  label: string
  revenue: number
}

function buildChartSeries(
  cfg: PeriodConfig,
  rows: Array<{ bucket: Date; revenue: number }>,
): ChartPoint[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = new Date(row.bucket).toISOString()
    map.set(key, Number(row.revenue))
  }

  const points: ChartPoint[] = []
  for (let i = 0; i < cfg.bucketCount; i++) {
    const d = bucketDate(cfg, i)
    const iso = d.toISOString()
    points.push({
      date: iso,
      label: formatBucketLabel(d, cfg.bucket),
      revenue: map.get(iso) ?? 0,
    })
  }
  return points
}

function bucketDate(cfg: PeriodConfig, index: number): Date {
  const d = new Date(cfg.start)
  switch (cfg.bucket) {
    case "hour":
      d.setHours(d.getHours() + index, 0, 0, 0)
      break
    case "day":
      d.setDate(d.getDate() + index)
      d.setHours(0, 0, 0, 0)
      break
    case "week":
      d.setDate(d.getDate() + index * 7)
      d.setHours(0, 0, 0, 0)
      break
    case "month":
      d.setMonth(d.getMonth() + index, 1)
      d.setHours(0, 0, 0, 0)
      break
  }
  return d
}

function formatBucketLabel(d: Date, bucket: Bucket): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  switch (bucket) {
    case "hour":
      return `${String(d.getHours()).padStart(2, "0")}h`
    case "day":
      return `${dd}/${mm}`
    case "week":
      return `${dd}/${mm}`
    case "month":
      return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
    default: {
      // Exhaustiveness check — se um novo bucket for adicionado ao enum, o TS quebra aqui.
      const _exhaustive: never = bucket
      return _exhaustive
    }
  }
}
