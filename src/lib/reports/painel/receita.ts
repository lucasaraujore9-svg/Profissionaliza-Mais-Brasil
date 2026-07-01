import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { fillBuckets, toSeriesPoints } from "../bucket"
import { approvedRevenueByBucket, approvedRevenueTotal } from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type PainelBiContext, type PainelBiModule } from "./context"

const METHOD_LABELS: Record<string, string> = {
  credit_card: "Cartão",
  pix: "PIX",
  bolbradesco: "Boleto",
  boleto: "Boleto",
  account_money: "Saldo MP",
  debit_card: "Débito",
}

export const receitaModule: PainelBiModule = {
  async run(ctx: PainelBiContext) {
    const { period, tenantId } = ctx
    const range = { gte: period.start, lt: period.end }
    const paymentWhere: Prisma.PaymentWhereInput = {
      tenantId,
      mpStatus: "APPROVED",
      paidAt: range,
    }

    const [
      revenue,
      revenuePrev,
      count,
      revSeriesRows,
      byMethod,
      byGateway,
      byType,
      discountAgg,
      recent,
    ] = await Promise.all([
      approvedRevenueTotal({ start: period.start, end: period.end, tenantId }),
      approvedRevenueTotal({ start: period.previous.start, end: period.previous.end, tenantId }),
      prisma.payment.count({ where: paymentWhere }),
      approvedRevenueByBucket({ start: period.start, end: period.end, bucket: period.bucket, tenantId }),
      prisma.payment.groupBy({ by: ["mpPaymentType"], where: paymentWhere, _sum: { amount: true } }),
      prisma.payment.groupBy({ by: ["gateway"], where: paymentWhere, _sum: { amount: true } }),
      prisma.payment.groupBy({ by: ["type"], where: paymentWhere, _sum: { amount: true } }),
      prisma.enrollment.aggregate({
        where: { tenantId, createdAt: range, couponId: { not: null } },
        _avg: { discountAmount: true },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paidAt: "desc" },
        take: 100,
        select: {
          amount: true,
          gateway: true,
          type: true,
          paidAt: true,
          enrollment: {
            select: {
              student: { select: { nome: true } },
              course: { select: { nome: true } },
            },
          },
        },
      }),
    ])

    const ticket = count > 0 ? revenue / count : 0
    const monthlyRevenue = Number(byType.find((t) => t.type === "MONTHLY")?._sum.amount ?? 0)
    const recurringShare = revenue > 0 ? (monthlyRevenue / revenue) * 100 : 0

    const kpis: KpiDatum[] = [
      { key: "revenue", label: "Receita", value: revenue, previousValue: revenuePrev, format: "currency", icon: "dollar-sign" },
      { key: "count", label: "Pagamentos", value: count, format: "number", icon: "receipt" },
      { key: "ticket", label: "Ticket médio", value: ticket, format: "currency", icon: "target" },
      { key: "recurring", label: "Recorrente", value: recurringShare, format: "percent", icon: "repeat" },
      {
        key: "discount",
        label: "Desconto médio",
        value: Number(discountAgg._avg.discountAmount ?? 0),
        format: "currency",
        icon: "percent",
      },
    ]

    const axis = fillBuckets(period.start, period.end, period.bucket)
    const series: ReportSeries[] = [
      {
        id: "revenue",
        kind: "area",
        title: "Receita no período",
        xKey: "x",
        series: [{ key: "receita", label: "Receita", format: "currency" }],
        points: toSeriesPoints(revSeriesRows, axis, period.bucket, "receita"),
      },
      {
        id: "by-method",
        kind: "donut",
        title: "Receita por método",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: byMethod.map((m) => ({
          x: METHOD_LABELS[m.mpPaymentType ?? ""] ?? m.mpPaymentType ?? "Outro",
          value: Number(m._sum.amount ?? 0),
        })),
      },
      {
        id: "by-gateway",
        kind: "donut",
        title: "Receita por gateway",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: byGateway.map((g) => ({ x: g.gateway, value: Number(g._sum.amount ?? 0) })),
      },
      {
        id: "by-type",
        kind: "donut",
        title: "Único × Recorrente",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: byType.map((t) => ({
          x: t.type === "MONTHLY" ? "Recorrente" : "Único",
          value: Number(t._sum.amount ?? 0),
        })),
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "pagamentos",
        title: "Pagamentos aprovados",
        subtitle: "Até 100 mais recentes",
        columns: [
          { key: "data", label: "Data", format: "text", sortable: true },
          { key: "aluno", label: "Aluno" },
          { key: "curso", label: "Curso" },
          { key: "tipo", label: "Tipo" },
          { key: "gateway", label: "Gateway" },
          { key: "valor", label: "Valor", format: "currency", align: "right", sortable: true },
        ],
        rows: recent.map((p) => ({
          data: (p.paidAt ?? new Date()).toISOString().slice(0, 10),
          aluno: p.enrollment.student.nome,
          curso: p.enrollment.course.nome,
          tipo: p.type === "MONTHLY" ? "Recorrente" : "Único",
          gateway: p.gateway,
          valor: Number(p.amount),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
