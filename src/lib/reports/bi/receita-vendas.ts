import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { fillBuckets, toSeriesPoints } from "../bucket"
import { approvedRevenueByBucket, approvedRevenueTotal, type Segment } from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

/** Taxa média de gateway usada para estimar receita líquida (igual ao dashboard). */
const FEE_RATE = 0.089

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit_card: "Cartão",
  pix: "PIX",
  bolbradesco: "Boleto",
  boleto: "Boleto",
  account_money: "Saldo MP",
  debit_card: "Débito",
}

function parseSegment(sp: URLSearchParams): Segment {
  const s = sp.get("segment")
  return s === "pmb" || s === "revenda" ? s : "todos"
}

/**
 * Resolve o segmento efetivo respeitando o escopo do papel (SEG-009).
 * PMB_SALES (vendedor de curso B2C) é forçado à vitrine PMB (`tenantId = null`)
 * independentemente do `segment` pedido na query — nunca vê receita de
 * revendedores. Os demais papéis desta aba (SUPER_ADMIN, PMB_FINANCEIRO) têm
 * visão de todo o ecossistema e escolhem o segmento livremente.
 */
export function resolveSegment(
  seesNetworkRevenue: boolean,
  sp: URLSearchParams,
): { segment: Segment; scopedToPmb: boolean } {
  const scopedToPmb = !seesNetworkRevenue
  return { segment: scopedToPmb ? "pmb" : parseSegment(sp), scopedToPmb }
}

export const receitaVendasModule: BiModule = {
  async run(ctx: BiContext) {
    const { period, sp, session } = ctx
    // Sem `financeiro.viewAll` a pessoa fica presa à vitrine PMB — nunca vê
    // receita de revendedores, e o split PMB×Revendedores é omitido para o
    // total das revendas não vazar pela diferença.
    const { segment, scopedToPmb } = resolveSegment(
      session.can("financeiro.viewAll"),
      sp,
    )

    const paymentWhere: Prisma.PaymentWhereInput = {
      mpStatus: "APPROVED",
      paidAt: { gte: period.start, lt: period.end },
      ...(segment === "pmb" ? { tenantId: null } : {}),
      ...(segment === "revenda" ? { tenantId: { not: null } } : {}),
    }

    const [
      revenue,
      revenuePrev,
      paymentsCount,
      revSeriesRows,
      byMethod,
      byGateway,
      byType,
      recent,
      pmbTotal,
      revendaTotal,
    ] = await Promise.all([
      approvedRevenueTotal({ start: period.start, end: period.end, segment }),
      approvedRevenueTotal({
        start: period.previous.start,
        end: period.previous.end,
        segment,
      }),
      prisma.payment.count({ where: paymentWhere }),
      approvedRevenueByBucket({
        start: period.start,
        end: period.end,
        bucket: period.bucket,
        segment,
      }),
      prisma.payment.groupBy({
        by: ["mpPaymentType"],
        where: paymentWhere,
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["gateway"],
        where: paymentWhere,
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["type"],
        where: paymentWhere,
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paidAt: "desc" },
        take: 100,
        select: {
          id: true,
          amount: true,
          gateway: true,
          type: true,
          paidAt: true,
          enrollment: {
            select: {
              student: { select: { nome: true } },
              course: { select: { nome: true } },
              tenant: { select: { name: true } },
            },
          },
        },
      }),
      approvedRevenueTotal({ start: period.start, end: period.end, segment: "pmb" }),
      approvedRevenueTotal({ start: period.start, end: period.end, segment: "revenda" }),
    ])

    const ticket = paymentsCount > 0 ? revenue / paymentsCount : 0
    const monthlyRevenue = Number(
      byType.find((t) => t.type === "MONTHLY")?._sum.amount ?? 0,
    )
    const recurringShare = revenue > 0 ? (monthlyRevenue / revenue) * 100 : 0

    const kpis: KpiDatum[] = [
      {
        key: "gross",
        label: "Receita bruta",
        value: revenue,
        previousValue: revenuePrev,
        format: "currency",
        icon: "dollar-sign",
      },
      {
        key: "net",
        label: "Receita líquida (est.)",
        value: revenue * (1 - FEE_RATE),
        format: "currency",
        icon: "wallet",
        hint: `− ${(FEE_RATE * 100).toFixed(1)}% taxa`,
      },
      { key: "count", label: "Pagamentos", value: paymentsCount, format: "number", icon: "receipt" },
      { key: "ticket", label: "Ticket médio", value: ticket, format: "currency", icon: "target" },
      {
        key: "recurring",
        label: "Recorrente",
        value: recurringShare,
        format: "percent",
        icon: "repeat",
      },
    ]

    const axis = fillBuckets(period.start, period.end, period.bucket)
    const series: ReportSeries[] = [
      {
        id: "revenue",
        kind: "area",
        title: "Receita no período",
        subtitle: "Pagamentos aprovados",
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
          x: PAYMENT_METHOD_LABELS[m.mpPaymentType ?? ""] ?? m.mpPaymentType ?? "Outro",
          value: Number(m._sum.amount ?? 0),
        })),
      },
      {
        id: "by-gateway",
        kind: "donut",
        title: "Receita por gateway",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: byGateway.map((g) => ({
          x: g.gateway,
          value: Number(g._sum.amount ?? 0),
        })),
      },
    ]

    // Split de origem só para papéis com visão de todo o ecossistema —
    // revela o total das revendas, fora do escopo de PMB_SALES.
    if (!scopedToPmb) {
      series.push({
        id: "split",
        kind: "donut",
        title: "PMB × Revendedores",
        subtitle: "Origem da receita",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: [
          { x: "Vitrine PMB", value: pmbTotal },
          { x: "Revendedores", value: revendaTotal },
        ],
      })
    }

    const tables: ReportTable[] = [
      {
        id: "pagamentos",
        title: "Pagamentos aprovados",
        subtitle: "Até 100 mais recentes no período",
        columns: [
          { key: "data", label: "Data", format: "text", sortable: true },
          { key: "aluno", label: "Aluno" },
          { key: "curso", label: "Curso" },
          { key: "origem", label: "Origem" },
          { key: "tipo", label: "Tipo" },
          { key: "gateway", label: "Gateway" },
          { key: "valor", label: "Valor", format: "currency", align: "right", sortable: true },
        ],
        rows: recent.map((p) => ({
          data: (p.paidAt ?? new Date()).toISOString().slice(0, 10),
          aluno: p.enrollment.student.nome,
          curso: p.enrollment.course.nome,
          origem: p.enrollment.tenant ? p.enrollment.tenant.name : "Vitrine PMB",
          tipo: p.type === "MONTHLY" ? "Recorrente" : "Único",
          gateway: p.gateway,
          valor: Number(p.amount),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
