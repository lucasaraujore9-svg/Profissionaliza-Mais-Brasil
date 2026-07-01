import { prisma } from "@/lib/prisma"
import { addMonthsClamped } from "@/lib/dates"
import { fillBuckets, toSeriesPoints } from "../bucket"
import { approvedRevenueByBucket } from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type PainelBiContext, type PainelBiModule } from "./context"

export const financeiroModule: PainelBiModule = {
  async run(ctx: PainelBiContext) {
    const { period, tenantId } = ctx
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const mrrStart = addMonthsClamped(new Date(now.getFullYear(), now.getMonth(), 1), -11)

    const [monthApproved, allTime, pendingAgg, revSeriesRows, mrrRows, payments] =
      await Promise.all([
        prisma.payment.aggregate({
          where: { tenantId, mpStatus: "APPROVED", paidAt: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { tenantId, mpStatus: "APPROVED" },
          _sum: { amount: true },
        }),
        prisma.enrollment.aggregate({
          where: { tenantId, status: "PENDING" },
          _sum: { finalAmount: true },
        }),
        approvedRevenueByBucket({ start: period.start, end: period.end, bucket: period.bucket, tenantId }),
        prisma.$queryRaw<{ bucket: Date; value: number }[]>`
          SELECT date_trunc('month', paid_at) AS bucket,
                 COALESCE(SUM(amount), 0)::float AS value
          FROM payments
          WHERE tenant_id = ${tenantId}
            AND mp_status = 'APPROVED'
            AND type = 'MONTHLY'
            AND paid_at >= ${mrrStart}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        prisma.payment.findMany({
          where: {
            tenantId,
            mpStatus: "APPROVED",
            paidAt: { gte: period.start, lt: period.end },
          },
          orderBy: { paidAt: "desc" },
          take: 200,
          select: {
            amount: true,
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

    const monthRevenue = Number(monthApproved._sum.amount ?? 0)
    const received = Number(allTime._sum.amount ?? 0)
    const pending = Number(pendingAgg._sum.finalAmount ?? 0)
    const toReceive = Math.max(monthRevenue * 0.05, 0)

    const kpis: KpiDatum[] = [
      { key: "month", label: "Receita do mês", value: monthRevenue, format: "currency", icon: "dollar-sign" },
      { key: "received", label: "Recebido (total)", value: received, format: "currency", icon: "wallet" },
      { key: "pending", label: "Pendente", value: pending, format: "currency", icon: "clock" },
      { key: "toReceive", label: "A receber (est.)", value: toReceive, format: "currency", icon: "circle-dollar-sign" },
    ]

    const revAxis = fillBuckets(period.start, period.end, period.bucket)
    const mrrAxis = fillBuckets(mrrStart, now, "month")
    const series: ReportSeries[] = [
      {
        id: "revenue",
        kind: "area",
        title: "Receita no período",
        xKey: "x",
        series: [{ key: "receita", label: "Receita", format: "currency" }],
        points: toSeriesPoints(revSeriesRows, revAxis, period.bucket, "receita"),
      },
      {
        id: "mrr",
        kind: "line",
        title: "Receita recorrente por mês",
        subtitle: "Pagamentos MONTHLY (últimos 12 meses)",
        xKey: "x",
        series: [{ key: "mrr", label: "Recorrente", format: "currency" }],
        points: toSeriesPoints(
          mrrRows.map((r) => ({ bucket: new Date(r.bucket), value: Number(r.value) })),
          mrrAxis,
          "month",
          "mrr",
        ),
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "pagamentos",
        title: "Pagamentos aprovados",
        subtitle: "Até 200 no período",
        exportHref: "/api/painel/financeiro/export-csv",
        columns: [
          { key: "data", label: "Data", format: "text", sortable: true },
          { key: "aluno", label: "Aluno" },
          { key: "curso", label: "Curso" },
          { key: "tipo", label: "Tipo" },
          { key: "valor", label: "Valor", format: "currency", align: "right", sortable: true },
        ],
        rows: payments.map((p) => ({
          data: (p.paidAt ?? new Date()).toISOString().slice(0, 10),
          aluno: p.enrollment.student.nome,
          curso: p.enrollment.course.nome,
          tipo: p.type === "MONTHLY" ? "Recorrente" : "Único",
          valor: Number(p.amount),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
