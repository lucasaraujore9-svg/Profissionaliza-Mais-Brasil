import { prisma } from "@/lib/prisma"
import { CHURN_BASE_WHERE, NEVER_ACTIVATED_WHERE } from "@/lib/tenants/lifecycle"
import { bucketKey, bucketLabel, fillBuckets } from "../bucket"
import { approvedRevenueTotal } from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable, SeriesPoint } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

async function tenantPaymentByBucket(
  column: "paid_at" | "due_date",
  statuses: string[],
  start: Date,
  end: Date,
  bucket: string,
): Promise<{ bucket: Date; value: number }[]> {
  const statusList = statuses.map((s) => `'${s}'`).join(",")
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; value: number }[]>(
    `SELECT date_trunc($1, ${column}) AS bucket,
            COALESCE(SUM(amount), 0)::float AS value
       FROM tenant_payments
      WHERE status IN (${statusList})
        AND ${column} >= $2
        AND ${column} < $3
      GROUP BY 1
      ORDER BY 1 ASC`,
    bucket,
    start,
    end,
  )
  return rows.map((r) => ({ bucket: new Date(r.bucket), value: Number(r.value) }))
}

export const financeiroModule: BiModule = {
  async run(ctx: BiContext) {
    const { period } = ctx
    const now = new Date()
    const thirty = new Date(now)
    thirty.setDate(now.getDate() - 30)
    const sixty = new Date(now)
    sixty.setDate(now.getDate() - 60)

    const [
      activeTenants,
      churnedTenants,
      payingTenants,
      neverActivatedTenants,
      mrrAgg,
      paidLast30Agg,
      paidPrev30Agg,
      receivedRows,
      overdueRows,
      tpReceivedTotal,
      b2cTotal,
      recentPayments,
      overdueList,
    ] = await Promise.all([
      prisma.tenant.findMany({
        where: { status: "ACTIVE", planValue: { gt: 0 } },
        select: { planValue: true },
      }),
      // Churn conta só quem CHEGOU a ser cliente pagante. `planValue > 0` não
      // serve de proxy: é o valor de hoje, e unidade que nasceu de graça (ou
      // com o vencimento lá na frente) e foi suspensa antes do 1º boleto
      // entrava no numerador como cliente perdido — sem nunca ter dado receita.
      // Ver `lib/tenants/lifecycle.ts`.
      prisma.tenant.count({ where: { ...CHURN_BASE_WHERE, status: "CANCELLED" } }),
      prisma.tenant.count({ where: CHURN_BASE_WHERE }),
      prisma.tenant.count({ where: NEVER_ACTIVATED_WHERE }),
      prisma.tenant.aggregate({
        _sum: { planValue: true },
        where: { status: "ACTIVE", planValue: { gt: 0 } },
      }),
      prisma.tenantPayment.aggregate({
        _sum: { amount: true },
        where: { status: { in: ["RECEIVED", "CONFIRMED"] }, paidAt: { gte: thirty, lte: now } },
      }),
      prisma.tenantPayment.aggregate({
        _sum: { amount: true },
        where: { status: { in: ["RECEIVED", "CONFIRMED"] }, paidAt: { gte: sixty, lt: thirty } },
      }),
      tenantPaymentByBucket("paid_at", ["RECEIVED", "CONFIRMED"], period.start, period.end, period.bucket),
      tenantPaymentByBucket("due_date", ["OVERDUE"], period.start, period.end, period.bucket),
      prisma.tenantPayment.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ["RECEIVED", "CONFIRMED"] },
          paidAt: { gte: period.start, lt: period.end },
        },
      }),
      approvedRevenueTotal({ start: period.start, end: period.end }),
      prisma.tenantPayment.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
      prisma.tenantPayment.findMany({
        where: { status: "OVERDUE" },
        orderBy: { dueDate: "asc" },
        take: 30,
        select: {
          amount: true,
          dueDate: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
    ])

    const mrr = Number(mrrAgg._sum.planValue ?? 0)
    const arr = mrr * 12
    const churn = payingTenants > 0 ? (churnedTenants / payingTenants) * 100 : 0
    const paidLast30 = Number(paidLast30Agg._sum.amount ?? 0)
    const paidPrev30 = Number(paidPrev30Agg._sum.amount ?? 0)
    const avgTicket = activeTenants.length > 0 ? mrr / activeTenants.length : 0
    const ltv = avgTicket * 24

    const kpis: KpiDatum[] = [
      { key: "mrr", label: "MRR", value: mrr, format: "currency", icon: "repeat" },
      { key: "arr", label: "ARR", value: arr, format: "currency", icon: "circle-dollar-sign" },
      // "(pagantes)" no rótulo é deliberado: a base mudou, e comparar este
      // número com o do mês passado sem perceber isso levaria à conclusão
      // errada de que o churn caiu sozinho.
      {
        key: "churn",
        label: "Churn (pagantes)",
        value: churn,
        format: "percent",
        icon: "alert-triangle",
        invertDelta: true,
      },
      {
        key: "nuncaAtivou",
        label: "Nunca ativou",
        value: neverActivatedTenants,
        format: "number",
        icon: "user-x",
        invertDelta: true,
      },
      { key: "ltv", label: "LTV", value: ltv, format: "currency", icon: "trending-up" },
      {
        key: "paid30",
        label: "Recebido 30d",
        value: paidLast30,
        previousValue: paidPrev30,
        format: "currency",
        icon: "wallet",
      },
      { key: "active", label: "Revendas ativas", value: activeTenants.length, format: "number", icon: "store" },
    ]

    // Barra recebido × atraso por bucket.
    const axis = fillBuckets(period.start, period.end, period.bucket)
    const receivedMap = new Map(receivedRows.map((r) => [bucketKey(r.bucket, period.bucket), r.value]))
    const overdueMap = new Map(overdueRows.map((r) => [bucketKey(r.bucket, period.bucket), r.value]))
    const composto: SeriesPoint[] = axis.map((k) => ({
      x: bucketLabel(k, period.bucket),
      recebido: receivedMap.get(k) ?? 0,
      atraso: overdueMap.get(k) ?? 0,
    }))

    const series: ReportSeries[] = [
      {
        id: "recebido-atraso",
        kind: "bar",
        title: "Mensalidades: recebido × em atraso",
        xKey: "x",
        series: [
          { key: "recebido", label: "Recebido", color: "#025918", format: "currency" },
          { key: "atraso", label: "Em atraso", color: "#B91C1C", format: "currency" },
        ],
        points: composto,
      },
      {
        id: "composicao",
        kind: "donut",
        title: "Composição da receita",
        subtitle: "Mensalidades (revenda) × vendas B2C",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: [
          { x: "Mensalidades revenda", value: Number(tpReceivedTotal._sum.amount ?? 0) },
          { x: "Vendas B2C", value: b2cTotal },
        ],
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "mensalidades",
        title: "Mensalidades recentes",
        columns: [
          { key: "revenda", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "status", label: "Status" },
          { key: "venc", label: "Vencimento", format: "text" },
          { key: "pago", label: "Pago em", format: "text" },
          { key: "valor", label: "Valor", format: "currency", align: "right", sortable: true },
        ],
        rows: recentPayments.map((p) => ({
          id: p.tenant.id,
          revenda: p.tenant.name,
          status: p.status,
          venc: p.dueDate.toISOString().slice(0, 10),
          pago: p.paidAt ? p.paidAt.toISOString().slice(0, 10) : "—",
          valor: Number(p.amount),
        })),
      },
      {
        id: "atraso",
        title: "Mensalidades em atraso",
        columns: [
          { key: "revenda", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "venc", label: "Vencimento", format: "text", sortable: true },
          { key: "valor", label: "Valor", format: "currency", align: "right", sortable: true },
        ],
        rows: overdueList.map((p) => ({
          id: p.tenant.id,
          revenda: p.tenant.name,
          venc: p.dueDate.toISOString().slice(0, 10),
          valor: Number(p.amount),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
