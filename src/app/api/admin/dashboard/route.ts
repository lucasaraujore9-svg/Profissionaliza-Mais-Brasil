import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { LeadStatus } from "@prisma/client"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  tenantScopeWhere,
  leadScopeWhere,
  salesTeamIds,
} from "@/lib/auth/scope"
import { withRequestContext } from "@/lib/observability/with-request-context"

const FEE_RATE = 0.089 // 8.9% taxas médias Asaas+MP para cálculo de líquido aproximado

interface RevenuePoint {
  label: string
  bruta: number
  liquida: number
}

/** Card genérico dos dashboards com escopo (papéis não-admin). */
interface ScopedCard {
  label: string
  value: string
  sub?: string
  accent?: "green" | "amber" | "red" | "gray"
}

interface ScopedUnit {
  id: string
  name: string
  slug: string
  status: string
  students: number
}

interface ScopedLead {
  id: string
  companyName: string
  status: string
  createdAt: string
}

export const GET = withRequestContext(
  { action: "admin.dashboard.get", route: "/api/admin/dashboard" },
  async (request: Request) => {
    const session = await requireAdminSession()
    if (!session) {
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

    // SUPER_ADMIN mantém o dashboard completo do ecossistema. Os demais papéis
    // recebem um painel com escopo (apenas as unidades/leads/vendas deles).
    if (session.role === "SUPER_ADMIN") {
      return NextResponse.json({
        data: await buildAdminDashboard(period, periodStart, now),
      })
    }

    if (
      session.role === "PMB_REVENDA_SALES" ||
      session.role === "PMB_SALES_MGR"
    ) {
      return NextResponse.json({
        data: await buildRevendaDashboard(session, periodStart),
      })
    }

    if (session.role === "PMB_RESELLER_MGR") {
      return NextResponse.json({
        data: await buildSuporteDashboard(session),
      })
    }

    if (session.role === "PMB_SALES") {
      return NextResponse.json({
        data: await buildVendasDashboard(session.userId, periodStart),
      })
    }

    // Papel autenticado no time PMB mas sem dashboard próprio: payload vazio
    // (o client mostra um estado neutro em vez de erro).
    return NextResponse.json({ data: { variant: "empty" as const } })
  },
)

// ---------------------------------------------------------------------------
// SUPER_ADMIN — dashboard completo do ecossistema
// ---------------------------------------------------------------------------

async function buildAdminDashboard(
  period: "30d" | "90d" | "12m",
  periodStart: Date,
  now: Date,
) {
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
    prisma.tenantPayment
      .count({
        where: { status: "OVERDUE" },
      })
      .catch(() => 0),
    prisma.course.count({ where: { status: "ATIVO" } }),
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

  const totalResellers =
    activeResellers + pendingResellers + suspendedResellers + cancelledResellers
  const overdueRate =
    totalResellers > 0 ? (overdueTenantPayments / totalResellers) * 100 : 0

  const currentRevenue = Number(currentRevenueAgg._sum?.amount ?? 0)
  const previousRevenue = Number(previousRevenueAgg._sum?.amount ?? 0)
  const revenueChangePct =
    previousRevenue > 0
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
      : currentRevenue > 0
        ? 100
        : 0

  const studentsChange = totalStudents - totalStudentsPrev
  const studentsChangePct =
    totalStudentsPrev > 0 ? (studentsChange / totalStudentsPrev) * 100 : 0

  const [chart, topResellersRaw, alerts] = await Promise.all([
    buildRevenueChart(period, periodStart, now),
    prisma.tenant.findMany({
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
    }),
    buildAlerts(),
  ])

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

  return {
    variant: "admin" as const,
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
  }
}

// ---------------------------------------------------------------------------
// Comercial de revenda — vendedor de unidade (PMB_REVENDA_SALES) e gerente de
// vendas (PMB_SALES_MGR). Escopo: suas unidades + seus leads (ou do time).
// ---------------------------------------------------------------------------

async function buildRevendaDashboard(
  session: { userId: string; role: string },
  periodStart: Date,
) {
  const isManager = session.role === "PMB_SALES_MGR"
  const tWhere = (await tenantScopeWhere(session)) ?? { id: "__none__" }
  const lWhere = (await leadScopeWhere(session)) ?? { id: "__none__" }
  const openLead = { in: ["NEW", "CONTACTED"] as LeadStatus[] }

  const [
    activeUnits,
    pendingUnits,
    suspendedUnits,
    openLeads,
    conversions,
    teamSize,
    unitsRaw,
    leadsRaw,
  ] = await Promise.all([
    prisma.tenant.count({ where: { ...tWhere, status: "ACTIVE" } }),
    prisma.tenant.count({ where: { ...tWhere, status: "PENDING" } }),
    prisma.tenant.count({ where: { ...tWhere, status: "SUSPENDED" } }),
    prisma.lead.count({ where: { ...lWhere, status: openLead } }),
    prisma.lead.count({
      where: { ...lWhere, status: "CONVERTED", updatedAt: { gte: periodStart } },
    }),
    isManager
      ? salesTeamIds(session.userId).then((ids) => Math.max(0, ids.length - 1))
      : Promise.resolve(0),
    prisma.tenant.findMany({
      where: tWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.lead.findMany({
      where: { ...lWhere, status: openLead },
      select: { id: true, companyName: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ])

  const cards: ScopedCard[] = [
    {
      label: isManager ? "Unidades ativas (time)" : "Minhas unidades ativas",
      value: String(activeUnits),
      accent: "green",
    },
    {
      label: "Aguardando pagamento",
      value: String(pendingUnits),
      accent: pendingUnits > 0 ? "amber" : "gray",
    },
    {
      label: "Leads em aberto",
      value: String(openLeads),
      sub: "Novos + contatados",
    },
    {
      label: "Conversões no período",
      value: String(conversions),
      accent: "green",
    },
  ]
  if (suspendedUnits > 0) {
    cards.push({
      label: "Unidades suspensas",
      value: String(suspendedUnits),
      accent: "red",
    })
  }
  if (isManager) {
    cards.push({
      label: "Vendedores no time",
      value: String(teamSize),
      accent: "gray",
    })
  }

  const units: ScopedUnit[] = unitsRaw.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    students: t._count.students,
  }))
  const leads: ScopedLead[] = leadsRaw.map((l) => ({
    id: l.id,
    companyName: l.companyName,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  }))

  return {
    variant: "revenda" as const,
    title: isManager ? "Painel do gerente de vendas" : "Meu painel comercial",
    cards,
    units,
    leads,
  }
}

// ---------------------------------------------------------------------------
// Gerente de suporte (PMB_RESELLER_MGR) — unidades onde é account manager.
// ---------------------------------------------------------------------------

async function buildSuporteDashboard(session: {
  userId: string
  role: string
}) {
  const tWhere = (await tenantScopeWhere(session)) ?? { id: "__none__" }

  const [activeUnits, pendingUnits, suspendedUnits, total, unitsRaw] =
    await Promise.all([
      prisma.tenant.count({ where: { ...tWhere, status: "ACTIVE" } }),
      prisma.tenant.count({ where: { ...tWhere, status: "PENDING" } }),
      prisma.tenant.count({ where: { ...tWhere, status: "SUSPENDED" } }),
      prisma.tenant.count({ where: tWhere }),
      prisma.tenant.findMany({
        where: tWhere,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: { select: { students: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ])

  const cards: ScopedCard[] = [
    { label: "Unidades sob suporte", value: String(total), accent: "gray" },
    { label: "Ativas", value: String(activeUnits), accent: "green" },
    {
      label: "Suspensas / inadimplentes",
      value: String(suspendedUnits),
      accent: suspendedUnits > 0 ? "red" : "gray",
    },
    {
      label: "Aguardando pagamento",
      value: String(pendingUnits),
      accent: pendingUnits > 0 ? "amber" : "gray",
    },
  ]

  const units: ScopedUnit[] = unitsRaw.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    students: t._count.students,
  }))

  return {
    variant: "suporte" as const,
    title: "Unidades sob meu suporte",
    cards,
    units,
  }
}

// ---------------------------------------------------------------------------
// Vendedor de curso B2C (PMB_SALES) — suas vendas na vitrine PMB.
// ---------------------------------------------------------------------------

async function buildVendasDashboard(userId: string, periodStart: Date) {
  const base = { tenantId: null as null, soldByUserId: userId }

  const [salesPeriod, salesTotal, revenueAgg] = await Promise.all([
    prisma.enrollment.count({
      where: { ...base, createdAt: { gte: periodStart } },
    }),
    prisma.enrollment.count({ where: base }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { ...base, mpStatus: "APPROVED", paidAt: { gte: periodStart } },
    }),
  ])

  const cards: ScopedCard[] = [
    {
      label: "Minhas vendas no período",
      value: String(salesPeriod),
      accent: "green",
    },
    {
      label: "Receita no período",
      value: formatBRL(Number(revenueAgg._sum?.amount ?? 0)),
      accent: "green",
    },
    {
      label: "Total de vendas",
      value: String(salesTotal),
      accent: "gray",
    },
  ]

  return { variant: "vendas" as const, title: "Minhas vendas diretas", cards }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
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

  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; total: number }[]>(
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
