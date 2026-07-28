import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

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

/** Agrega receita de pagamentos aprovados por mês via SQL (evita carregar todas as linhas em JS) */
async function fetchRevenueByMonthSQL(
  since: Date,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; total: number }[]>(
    `SELECT date_trunc('month', created_at) AS bucket,
            COALESCE(SUM(amount), 0)::float AS total
     FROM payments
     WHERE mp_status = 'APPROVED'
       AND created_at >= $1
     GROUP BY 1
     ORDER BY 1 ASC`,
    since,
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(monthKey(new Date(r.bucket)), Number(r.total))
  }
  return map
}

/** Agrega matrículas por mês via SQL, com contagem de pagas (tem mp_payment_id ou asaas_payment_id) */
async function fetchEnrollmentsByMonthSQL(since: Date): Promise<
  Map<string, { total: number; paid: number }>
> {
  const rows = await prisma.$queryRawUnsafe<
    { bucket: Date; total: bigint; paid: bigint }[]
  >(
    `SELECT date_trunc('month', created_at) AS bucket,
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE mp_payment_id IS NOT NULL OR asaas_payment_id IS NOT NULL)::bigint AS paid
     FROM enrollments
     WHERE created_at >= $1
     GROUP BY 1
     ORDER BY 1 ASC`,
    since,
  )
  const map = new Map<string, { total: number; paid: number }>()
  for (const r of rows) {
    map.set(monthKey(new Date(r.bucket)), {
      total: Number(r.total),
      paid: Number(r.paid),
    })
  }
  return map
}

export const GET = withRequestContext(
  { action: "admin.analytics.get", route: "/api/admin/analytics" },
  async (request: Request) => {
  const guard = await requireAdmin("relatorios.visaoGeral")
  if (!guard.ok) return guard.response
  // Analytics expoe MRR/churn/LTV e ranking do ecossistema (dados globais).
  // A tela /admin/analytics e SUPER_ADMIN-only — alinha a API ao gate da UI.
  const url = new URL(request.url)
  const periodParam = (url.searchParams.get("period") ?? "30d") as Period
  const days = PERIODS[periodParam] ?? 30
  const since = startOfDay(subDays(new Date(), days))

  const sixMonthsAgo = subDays(new Date(), 180)

  const [
    newResellers,
    newStudents,
    enrollmentsInPeriod,
    approvedPaymentsInPeriod,
    activeTenants,
    totalTenants,
    cancelledTenants,
    activeMrrAgg,
    revenueByMonthMap,
    enrollmentsByMonthMap,
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
    fetchRevenueByMonthSQL(sixMonthsAgo),
    fetchEnrollmentsByMonthSQL(sixMonthsAgo),
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

  // SQL aggregation already grouped by month — just read from the maps
  const revenueMap = new Map<string, number>(months.map((m) => [m, revenueByMonthMap.get(m) ?? 0]))

  const studentsMap = new Map<string, number>(
    months.map((m) => [m, enrollmentsByMonthMap.get(m)?.total ?? 0]),
  )
  const conversionByMonthArr = months.map((m) => {
    const bucket = enrollmentsByMonthMap.get(m)
    const enr = bucket?.total ?? 0
    const paid = bucket?.paid ?? 0
    return enr > 0 ? Number(((paid / enr) * 100).toFixed(1)) : 0
  })

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
        conversionByMonth: conversionByMonthArr,
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
  },
)
