import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  NEVER_PAID_TENANT_WHERE,
  EVER_PAID_TENANT_WHERE,
} from "@/lib/tenants/lifecycle"
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
    const scope = await session.unidadesWhere()
    if (!scope) return buildPayload(period, {})

    // Exclui o placeholder da vitrine PMB.
    const base: Prisma.TenantWhereInput = { ...scope, slug: { not: PMB_TENANT_SLUG } }

    // Fora do ar por INADIMPLÊNCIA — já foi cliente e parou de pagar. Separado
    // de quem nunca pagou: misturar os dois fazia a unidade que nunca gerou
    // receita aparecer como cliente perdido, inflando "Suspensas" e o churn.
    const inadimplenteWhere: Prisma.TenantWhereInput = {
      ...base,
      status: { in: ["SUSPENDED", "CANCELLED"] },
      ...EVER_PAID_TENANT_WHERE,
    }
    const nuncaAtivouWhere: Prisma.TenantWhereInput = {
      ...base,
      status: { in: ["SUSPENDED", "CANCELLED"] },
      ...NEVER_PAID_TENANT_WHERE,
    }

    const [
      funnel,
      mrrAgg,
      activeTenants,
      novas,
      byManager,
      rankingRows,
      inadimplentes,
      nuncaAtivouRows,
      nuncaAtivouSuspensas,
      nuncaAtivouCanceladas,
    ] = await Promise.all([
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
          where: inadimplenteWhere,
          select: { id: true, name: true, status: true, planValue: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        prisma.tenant.findMany({
          where: nuncaAtivouWhere,
          select: {
            id: true,
            name: true,
            status: true,
            planValue: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.tenant.count({ where: { ...nuncaAtivouWhere, status: "SUSPENDED" } }),
        prisma.tenant.count({ where: { ...nuncaAtivouWhere, status: "CANCELLED" } }),
      ])

    const countByStatus = (s: string) =>
      funnel.find((f) => f.status === s)?._count._all ?? 0
    const mrr = Number(mrrAgg._sum.planValue ?? 0)
    const active = countByStatus("ACTIVE")
    const avgPlan = activeTenants.length > 0 ? mrr / activeTenants.length : 0

    // "Suspensas" e "Canceladas" passam a contar só quem JÁ PAGOU. Quem nunca
    // pagou tem bucket próprio — antes as duas populações vinham somadas e a
    // unidade que nunca deu receita aparecia como cliente perdido.
    const nuncaAtivou = nuncaAtivouSuspensas + nuncaAtivouCanceladas
    const suspensas = countByStatus("SUSPENDED") - nuncaAtivouSuspensas
    const canceladas = countByStatus("CANCELLED") - nuncaAtivouCanceladas

    const kpis: KpiDatum[] = [
      { key: "active", label: "Ativas", value: active, format: "number", icon: "store" },
      { key: "pending", label: "Pendentes", value: countByStatus("PENDING"), format: "number", icon: "clock" },
      { key: "suspended", label: "Suspensas", value: suspensas, format: "number", icon: "alert-triangle", invertDelta: true },
      { key: "nuncaAtivou", label: "Nunca ativou", value: nuncaAtivou, format: "number", icon: "user-x", invertDelta: true },
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
          { x: "Suspensas", value: suspensas },
          { x: "Canceladas", value: canceladas },
          { x: "Nunca ativou", value: nuncaAtivou },
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
        subtitle: "Já pagaram ao menos uma mensalidade",
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
      {
        id: "nunca-ativou",
        title: "Nunca ativou",
        subtitle:
          "Suspensas ou canceladas sem nenhum pagamento registrado — fora do churn",
        columns: [
          { key: "nome", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "status", label: "Status" },
          { key: "criada", label: "Criada em", format: "text", sortable: true },
          { key: "plano", label: "Plano", format: "currency", align: "right" },
        ],
        rows: nuncaAtivouRows.map((t) => ({
          id: t.id,
          nome: t.name,
          status: t.status,
          criada: t.createdAt.toISOString().slice(0, 10),
          plano: Number(t.planValue),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
