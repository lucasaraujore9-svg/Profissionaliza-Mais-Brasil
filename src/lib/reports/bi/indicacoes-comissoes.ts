import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  AVAILABLE: "Disponível",
  PAID: "Paga",
  CANCELLED: "Cancelada",
}

export const indicacoesComissoesModule: BiModule = {
  async run(ctx: BiContext) {
    const { period, session } = ctx
    // PMB_RESELLER_MGR só enxerga comissões de revendas que ele gerencia.
    const referrerFilter: Prisma.TenantWhereInput | undefined =
      session.role === "PMB_RESELLER_MGR"
        ? { accountManagerId: session.userId }
        : undefined
    const scope = referrerFilter ? { referrer: referrerFilter } : {}
    const range = { gte: period.start, lt: period.end }

    const [
      legacyInRange,
      monthlyInRange,
      available,
      paid,
      payoutsPaid,
      legacyByStatus,
      monthlyByStatus,
      legacyTotal,
      monthlyTotal,
      topReferrers,
      recentPayouts,
    ] = await Promise.all([
      prisma.referralCommission.aggregate({
        _sum: { amount: true },
        where: { ...scope, createdAt: range },
      }),
      prisma.referralMonthlyCommission.aggregate({
        _sum: { amount: true },
        where: { ...scope, createdAt: range },
      }),
      Promise.all([
        prisma.referralCommission.aggregate({ _sum: { amount: true }, where: { ...scope, status: "AVAILABLE" } }),
        prisma.referralMonthlyCommission.aggregate({ _sum: { amount: true }, where: { ...scope, status: "AVAILABLE" } }),
      ]),
      Promise.all([
        prisma.referralCommission.aggregate({ _sum: { amount: true }, where: { ...scope, status: "PAID" } }),
        prisma.referralMonthlyCommission.aggregate({ _sum: { amount: true }, where: { ...scope, status: "PAID" } }),
      ]),
      prisma.referralPayout.aggregate({
        _sum: { amount: true },
        where: { status: "PAID", ...(referrerFilter ? { referrer: referrerFilter } : {}) },
      }),
      prisma.referralCommission.groupBy({ by: ["status"], where: scope, _sum: { amount: true } }),
      prisma.referralMonthlyCommission.groupBy({ by: ["status"], where: scope, _sum: { amount: true } }),
      prisma.referralCommission.aggregate({ _sum: { amount: true }, where: scope }),
      prisma.referralMonthlyCommission.aggregate({ _sum: { amount: true }, where: scope }),
      prisma.referralCommission.groupBy({
        by: ["referrerTenantId"],
        where: { ...scope, createdAt: range },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 10,
      }),
      prisma.referralPayout.findMany({
        where: { ...(referrerFilter ? { referrer: referrerFilter } : {}) },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          amount: true,
          status: true,
          method: true,
          paidAt: true,
          referrer: { select: { id: true, name: true } },
        },
      }),
    ])

    const gerado =
      Number(legacyInRange._sum.amount ?? 0) + Number(monthlyInRange._sum.amount ?? 0)
    const disponivel =
      Number(available[0]._sum.amount ?? 0) + Number(available[1]._sum.amount ?? 0)
    const pago = Number(paid[0]._sum.amount ?? 0) + Number(paid[1]._sum.amount ?? 0)

    const kpis: KpiDatum[] = [
      { key: "gerado", label: "Geradas no período", value: gerado, format: "currency", icon: "share-2" },
      { key: "disponivel", label: "Disponível a pagar", value: disponivel, format: "currency", icon: "wallet" },
      { key: "pago", label: "Já pagas", value: pago, format: "currency", icon: "check-circle-2" },
      {
        key: "saques",
        label: "Saques liquidados",
        value: Number(payoutsPaid._sum.amount ?? 0),
        format: "currency",
        icon: "circle-dollar-sign",
      },
    ]

    // Status combinado (ambos os motores).
    const statusMap = new Map<string, number>()
    for (const r of [...legacyByStatus, ...monthlyByStatus]) {
      statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + Number(r._sum.amount ?? 0))
    }

    const series: ReportSeries[] = [
      {
        id: "by-status",
        kind: "bar",
        title: "Comissões por status",
        xKey: "x",
        series: [{ key: "value", label: "Valor", format: "currency" }],
        points: [...statusMap.entries()].map(([s, value]) => ({
          x: STATUS_LABELS[s] ?? s,
          value,
        })),
      },
      {
        id: "by-engine",
        kind: "donut",
        title: "Motor de comissão",
        subtitle: "Por pagamento × mensal (faixas)",
        xKey: "x",
        series: [{ key: "value", label: "Valor", format: "currency" }],
        points: [
          { x: "Por pagamento", value: Number(legacyTotal._sum.amount ?? 0) },
          { x: "Mensal (faixas)", value: Number(monthlyTotal._sum.amount ?? 0) },
        ],
      },
    ]

    // Top indicadores por comissão.
    const referrerIds = topReferrers.map((r) => r.referrerTenantId)
    const referrerTenants = await prisma.tenant.findMany({
      where: { id: { in: referrerIds } },
      select: { id: true, name: true },
    })
    const referrerName = new Map(referrerTenants.map((t) => [t.id, t.name]))

    const tables: ReportTable[] = [
      {
        id: "top-indicadores",
        title: "Top indicadores",
        subtitle: "Comissão gerada no período",
        columns: [
          { key: "nome", label: "Indicador", href: "/admin/revendedores/{id}" },
          { key: "valor", label: "Comissão", format: "currency", align: "right", sortable: true },
        ],
        rows: topReferrers.map((r) => ({
          id: r.referrerTenantId,
          nome: referrerName.get(r.referrerTenantId) ?? "—",
          valor: Number(r._sum.amount ?? 0),
        })),
      },
      {
        id: "saques",
        title: "Saques recentes",
        columns: [
          { key: "nome", label: "Indicador", href: "/admin/revendedores/{id}" },
          { key: "status", label: "Status" },
          { key: "metodo", label: "Método" },
          { key: "pago", label: "Pago em", format: "text" },
          { key: "valor", label: "Valor", format: "currency", align: "right", sortable: true },
        ],
        rows: recentPayouts.map((p) => ({
          id: p.referrer.id,
          nome: p.referrer.name,
          status: p.status,
          metodo: p.method,
          pago: p.paidAt ? p.paidAt.toISOString().slice(0, 10) : "—",
          valor: Number(p.amount),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
