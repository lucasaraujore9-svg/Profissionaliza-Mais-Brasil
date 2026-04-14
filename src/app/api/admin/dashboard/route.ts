import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

const FEE_RATE = 0.089 // 8.9% taxas médias Asaas+MP para cálculo de líquido aproximado

interface RevenuePoint {
  label: string
  bruta: number
  liquida: number
}

export async function GET(request: Request) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodRaw = searchParams.get("period") ?? "30d"
  const period: "30d" | "90d" | "12m" =
    periodRaw === "90d" || periodRaw === "12m" ? periodRaw : "30d"

  const now = new Date()
  const periodStart = new Date(now)
  if (period === "30d") periodStart.setDate(now.getDate() - 30)
  else if (period === "90d") periodStart.setDate(now.getDate() - 90)
  else periodStart.setMonth(now.getMonth() - 12)

  const previousStart = new Date(periodStart)
  const periodMs = now.getTime() - periodStart.getTime()
  previousStart.setTime(periodStart.getTime() - periodMs)

  const [
    activeResellers,
    pendingResellers,
    suspendedResellers,
    cancelledResellers,
    totalStudents,
    totalStudentsPrev,
    currentRevenueAgg,
    previousRevenueAgg,
    overdueTenantPayments,
    activeCourses,
    newResellers7d,
    newStudents7d,
    processed7dAgg,
  ] = await Promise.all([
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.tenant.count({ where: { status: "PENDING" } }),
    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
    prisma.tenant.count({ where: { status: "CANCELLED" } }),
    prisma.student.count(),
    prisma.student.count({ where: { createdAt: { lt: periodStart } } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        mpStatus: "APPROVED",
        paidAt: { gte: periodStart, lte: now },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        mpStatus: "APPROVED",
        paidAt: { gte: previousStart, lt: periodStart },
      },
    }),
    prisma.tenantPayment.count({
      where: { status: "OVERDUE" },
    }).catch(() => 0),
    prisma.tenantCourse.count({ where: { isVisible: true } }),
    prisma.tenant.count({
      where: { createdAt: { gte: sevenDaysAgo(now) } },
    }),
    prisma.student.count({
      where: { createdAt: { gte: sevenDaysAgo(now) } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        mpStatus: "APPROVED",
        paidAt: { gte: sevenDaysAgo(now), lte: now },
      },
    }),
  ])

  const totalResellers = activeResellers + pendingResellers + suspendedResellers + cancelledResellers
  const overdueRate = totalResellers > 0
    ? (overdueTenantPayments / totalResellers) * 100
    : 0

  const currentRevenue = Number(currentRevenueAgg._sum?.amount ?? 0)
  const previousRevenue = Number(previousRevenueAgg._sum?.amount ?? 0)
  const revenueChangePct = previousRevenue > 0
    ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
    : currentRevenue > 0 ? 100 : 0

  const studentsChange = totalStudents - totalStudentsPrev
  const studentsChangePct = totalStudentsPrev > 0
    ? (studentsChange / totalStudentsPrev) * 100
    : 0

  const chart = await buildRevenueChart(period, periodStart, now)

  const topResellersRaw = await prisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      planValue: true,
      _count: { select: { students: true } },
      payments: {
        where: {
          mpStatus: "APPROVED",
          paidAt: { gte: periodStart, lte: now },
        },
        select: { amount: true },
      },
    },
    take: 50,
  })

  const topResellers = topResellersRaw
    .map((t) => {
      const mrr = t.payments.reduce((sum, p) => sum + Number(p.amount), 0)
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        mrr,
        students: t._count.students,
      }
    })
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 10)

  const alerts = await buildAlerts()

  return NextResponse.json({
    data: {
      period,
      metrics: {
        revenue: currentRevenue,
        revenueChangePct,
        activeResellers,
        newResellers7d,
        totalStudents,
        studentsChangePct,
        overdueRate,
        overdueCount: overdueTenantPayments,
      },
      quickStats: {
        newResellers7d,
        newStudents7d,
        processed7d: Number(processed7dAgg._sum?.amount ?? 0),
        activeCourses,
      },
      chart,
      topResellers,
      alerts,
    },
  })
}

function sevenDaysAgo(ref: Date): Date {
  const d = new Date(ref)
  d.setDate(d.getDate() - 7)
  return d
}

async function buildRevenueChart(
  period: "30d" | "90d" | "12m",
  start: Date,
  end: Date,
): Promise<RevenuePoint[]> {
  const bucket = period === "12m" ? "month" : period === "90d" ? "week" : "day"

  const rows = await prisma.$queryRawUnsafe<
    { bucket: Date; total: number }[]
  >(
    `SELECT date_trunc($1, paid_at) AS bucket, COALESCE(SUM(amount), 0)::float AS total
     FROM payments
     WHERE mp_status = 'APPROVED' AND paid_at >= $2 AND paid_at <= $3
     GROUP BY bucket
     ORDER BY bucket ASC`,
    bucket,
    start,
    end,
  )

  return rows.map((r) => {
    const bruta = Number(r.total)
    return {
      label: formatBucketLabel(r.bucket, bucket),
      bruta,
      liquida: bruta * (1 - FEE_RATE),
    }
  })
}

function formatBucketLabel(
  date: Date,
  bucket: "day" | "week" | "month",
): string {
  const d = new Date(date)
  if (bucket === "month") {
    return d.toLocaleDateString("pt-BR", { month: "short" })
  }
  if (bucket === "week") {
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
  }
  return d.getDate().toString().padStart(2, "0")
}

interface DashboardAlert {
  id: string
  level: "critical" | "warning" | "success"
  title: string
  description: string
  time: string
  tenantId?: string
}

async function buildAlerts(): Promise<DashboardAlert[]> {
  const alerts: DashboardAlert[] = []

  const overdueTenants = await prisma.tenant.findMany({
    where: { status: "SUSPENDED" },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
  })

  for (const t of overdueTenants) {
    alerts.push({
      id: `suspended-${t.id}`,
      level: "critical",
      title: `${t.name} — suspenso automaticamente`,
      description: "Revendedor inadimplente. Notificar ou reativar.",
      time: formatRelative(t.updatedAt),
      tenantId: t.id,
    })
  }

  const pendingTenants = await prisma.tenant.count({
    where: { status: "PENDING" },
  })
  if (pendingTenants > 0) {
    alerts.push({
      id: "pending-resellers",
      level: "warning",
      title: `${pendingTenants} revendedor(es) aguardando primeiro pagamento`,
      description: "Monitorar conversão do onboarding.",
      time: "",
    })
  }

  const newResellers = await prisma.tenant.count({
    where: {
      status: "ACTIVE",
      createdAt: { gte: sevenDaysAgo(new Date()) },
    },
  })
  if (newResellers > 0) {
    alerts.push({
      id: "new-resellers",
      level: "success",
      title: `${newResellers} novos revendedores ativos nos últimos 7 dias`,
      description: "Celebrar e acompanhar ativação inicial.",
      time: "",
    })
  }

  return alerts.slice(0, 5)
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return "há minutos"
  if (diffHours < 24) return `há ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `há ${diffDays}d`
}
