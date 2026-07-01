import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { tenantScopeWhere } from "@/lib/auth/scope"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

function planBucket(v: number): string {
  if (v <= 0) return "Cortesia"
  if (v < 200) return "< R$ 200"
  if (v < 300) return "R$ 200–299"
  return "R$ 300+"
}

export const redeRevendedoresModule: BiModule = {
  async run(ctx: BiContext) {
    const { period, session } = ctx
    const scope = await tenantScopeWhere({ userId: session.userId, role: session.role })
    if (!scope) return buildPayload(period, {})

    // Exclui o placeholder da vitrine PMB.
    const base: Prisma.TenantWhereInput = { ...scope, slug: { not: "__pmb__" } }

    const [funnel, mrrAgg, activeTenants, novas, byManager, rankingRows, inadimplentes] =
      await Promise.all([
        prisma.tenant.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
        prisma.tenant.aggregate({
          _sum: { planValue: true },
          where: { ...base, status: "ACTIVE", planValue: { gt: 0 } },
        }),
        prisma.tenant.findMany({
          where: { ...base, status: "ACTIVE", planValue: { gt: 0 } },
          select: { planValue: true },
        }),
        prisma.tenant.count({
          where: { ...base, createdAt: { gte: period.start, lt: period.end } },
        }),
        prisma.tenant.groupBy({
          by: ["accountManagerId"],
          where: { ...base, accountManagerId: { not: null } },
          _count: { _all: true },
        }),
        prisma.tenant.findMany({
          where: base,
          select: {
            id: true,
            name: true,
            status: true,
            planValue: true,
            _count: { select: { students: true } },
          },
          orderBy: { students: { _count: "desc" } },
          take: 20,
        }),
        prisma.tenant.findMany({
          where: { ...base, status: { in: ["SUSPENDED", "CANCELLED"] } },
          select: { id: true, name: true, status: true, planValue: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
      ])

    const countByStatus = (s: string) =>
      funnel.find((f) => f.status === s)?._count._all ?? 0
    const mrr = Number(mrrAgg._sum.planValue ?? 0)
    const active = countByStatus("ACTIVE")
    const avgPlan = activeTenants.length > 0 ? mrr / activeTenants.length : 0

    const kpis: KpiDatum[] = [
      { key: "active", label: "Ativas", value: active, format: "number", icon: "store" },
      { key: "pending", label: "Pendentes", value: countByStatus("PENDING"), format: "number", icon: "clock" },
      { key: "suspended", label: "Suspensas", value: countByStatus("SUSPENDED"), format: "number", icon: "alert-triangle", invertDelta: true },
      { key: "mrr", label: "MRR contratual", value: mrr, format: "currency", icon: "repeat" },
      { key: "avgPlan", label: "Ticket de plano", value: avgPlan, format: "currency", icon: "dollar-sign" },
      { key: "new", label: "Novas no período", value: novas, format: "number", icon: "user-plus" },
    ]

    // Distribuição por plano (donut).
    const planDist = new Map<string, number>()
    for (const t of activeTenants) {
      const k = planBucket(Number(t.planValue))
      planDist.set(k, (planDist.get(k) ?? 0) + 1)
    }

    // Por account manager (bar).
    const managerIds = byManager
      .map((m) => m.accountManagerId)
      .filter((x): x is string => !!x)
    const managers = await prisma.user.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, name: true },
    })
    const managerName = new Map(managers.map((m) => [m.id, m.name]))

    const series: ReportSeries[] = [
      {
        id: "funnel",
        kind: "funnel",
        title: "Funil de revendas",
        xKey: "x",
        series: [{ key: "value", label: "Revendas", format: "number" }],
        points: [
          { x: "Aguardando", value: countByStatus("PENDING") },
          { x: "Ativas", value: active },
          { x: "Suspensas", value: countByStatus("SUSPENDED") },
          { x: "Canceladas", value: countByStatus("CANCELLED") },
        ],
      },
      {
        id: "plan-dist",
        kind: "donut",
        title: "Distribuição por plano",
        subtitle: "Revendas ativas",
        xKey: "x",
        series: [{ key: "value", label: "Revendas", format: "number" }],
        points: [...planDist.entries()].map(([x, value]) => ({ x, value })),
      },
      {
        id: "by-manager",
        kind: "bar",
        title: "Revendas por gerente de conta",
        xKey: "x",
        series: [{ key: "value", label: "Revendas", format: "number" }],
        points: byManager.map((m) => ({
          x: managerName.get(m.accountManagerId ?? "") ?? "—",
          value: m._count._all,
        })),
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "ranking",
        title: "Ranking de revendas",
        subtitle: "Top 20 por nº de alunos",
        columns: [
          { key: "nome", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "status", label: "Status" },
          { key: "plano", label: "Plano", format: "currency", align: "right", sortable: true },
          { key: "alunos", label: "Alunos", format: "number", align: "right", sortable: true },
        ],
        rows: rankingRows.map((t) => ({
          id: t.id,
          nome: t.name,
          status: t.status,
          plano: Number(t.planValue),
          alunos: t._count.students,
        })),
      },
      {
        id: "inadimplentes",
        title: "Inadimplentes / canceladas",
        subtitle: "Status SUSPENDED ou CANCELLED",
        columns: [
          { key: "nome", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "status", label: "Status" },
          { key: "plano", label: "Plano", format: "currency", align: "right" },
        ],
        rows: inadimplentes.map((t) => ({
          id: t.id,
          nome: t.name,
          status: t.status,
          plano: Number(t.planValue),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
