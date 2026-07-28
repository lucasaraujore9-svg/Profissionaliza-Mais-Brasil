import { prisma } from "@/lib/prisma"
import { getPlacarSnapshot } from "@/lib/placar/snapshot"
import { fillBuckets, toSeriesPoints } from "../bucket"
import {
  approvedRevenueByBucket,
  approvedRevenueTotal,
} from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

/**
 * Visão Geral — resumo executivo do ecossistema. Os KPIs financeiros só
 * aparecem para quem tem `financeiro.view`; os demais veem só a operação.
 */
export const visaoGeralModule: BiModule = {
  async run(ctx: BiContext) {
    const { period, session } = ctx
    const finance = session.can("financeiro.view")

    const [
      revenue,
      revenuePrev,
      revSeriesRows,
      newStudents,
      newStudentsPrev,
      enrollTotal,
      enrollApproved,
      activeTenants,
      mrrAgg,
      placar,
      topRevendas,
    ] = await Promise.all([
      approvedRevenueTotal({ start: period.start, end: period.end }),
      approvedRevenueTotal({ start: period.previous.start, end: period.previous.end }),
      approvedRevenueByBucket({ start: period.start, end: period.end, bucket: period.bucket }),
      prisma.student.count({ where: { createdAt: { gte: period.start, lt: period.end } } }),
      prisma.student.count({
        where: { createdAt: { gte: period.previous.start, lt: period.previous.end } },
      }),
      prisma.enrollment.count({ where: { createdAt: { gte: period.start, lt: period.end } } }),
      prisma.enrollment.count({
        where: {
          createdAt: { gte: period.start, lt: period.end },
          status: { in: ["ACTIVE", "COMPLETED"] },
        },
      }),
      prisma.tenant.count({ where: { status: "ACTIVE", planValue: { gt: 0 } } }),
      prisma.tenant.aggregate({
        _sum: { planValue: true },
        where: { status: "ACTIVE", planValue: { gt: 0 } },
      }),
      getPlacarSnapshot(),
      prisma.payment.groupBy({
        by: ["tenantId"],
        where: {
          mpStatus: "APPROVED",
          tenantId: { not: null },
          paidAt: { gte: period.start, lt: period.end },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 10,
      }),
    ])

    const conversion = enrollTotal > 0 ? (enrollApproved / enrollTotal) * 100 : 0
    const mrr = Number(mrrAgg._sum.planValue ?? 0)

    const kpis: KpiDatum[] = []
    if (finance) {
      kpis.push({
        key: "revenue",
        label: "Receita no período",
        value: revenue,
        previousValue: revenuePrev,
        format: "currency",
        icon: "dollar-sign",
      })
      kpis.push({ key: "mrr", label: "MRR (revendas)", value: mrr, format: "currency", icon: "repeat" })
    }
    kpis.push({
      key: "students",
      label: "Alunos novos",
      value: newStudents,
      previousValue: newStudentsPrev,
      format: "number",
      icon: "graduation-cap",
    })
    kpis.push({
      key: "activeTenants",
      label: "Revendas ativas",
      value: activeTenants,
      format: "number",
      icon: "store",
    })
    kpis.push({
      key: "conversion",
      label: "Conversão de matrículas",
      value: conversion,
      format: "percent",
      icon: "target",
      hint: `${enrollApproved}/${enrollTotal}`,
    })

    const axis = fillBuckets(period.start, period.end, period.bucket)
    const series: ReportSeries[] = []
    if (finance) {
      series.push({
        id: "revenue",
        kind: "area",
        title: "Receita no período",
        subtitle: "Pagamentos aprovados",
        xKey: "x",
        series: [{ key: "receita", label: "Receita", format: "currency" }],
        points: toSeriesPoints(revSeriesRows, axis, period.bucket, "receita"),
      })
    }
    series.push({
      id: "funnel",
      kind: "funnel",
      title: "Funil de revendas",
      subtitle: "Status das unidades pagantes",
      xKey: "x",
      series: [{ key: "value", label: "Revendas", format: "number" }],
      points: [
        { x: "Aguardando", value: placar.funnel.aguardando },
        { x: "Ativas", value: placar.funnel.ativos },
        { x: "Suspensas", value: placar.funnel.suspensos },
        { x: "Canceladas", value: placar.funnel.cancelados },
      ],
    })

    const tables: ReportTable[] = []
    if (finance && topRevendas.length > 0) {
      const ids = topRevendas.map((t) => t.tenantId).filter((x): x is string => !!x)
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, slug: true },
      })
      const byId = new Map(tenants.map((t) => [t.id, t]))
      tables.push({
        id: "top-revendas",
        title: "Top revendas por receita",
        subtitle: "GMV no período",
        columns: [
          { key: "pos", label: "#", align: "left" },
          { key: "nome", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "receita", label: "Receita", format: "currency", align: "right", sortable: true },
        ],
        rows: topRevendas.map((t, i) => ({
          id: t.tenantId ?? "",
          pos: i + 1,
          nome: byId.get(t.tenantId ?? "")?.name ?? "—",
          receita: Number(t._sum.amount ?? 0),
        })),
      })
    }

    return buildPayload(period, { kpis, series, tables })
  },
}
