import { prisma } from "@/lib/prisma"
import { summaryForTenant } from "@/lib/referrals/commission"
import { getReferralPlacarSnapshot } from "@/lib/placar/snapshot"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type PainelBiContext, type PainelBiModule } from "./context"

export const indicacoesModule: PainelBiModule = {
  async run(ctx: PainelBiContext) {
    const { period, tenantId, canSellResellers } = ctx

    const [summary, payoutsPaid, monthly, legacyByMonth] = await Promise.all([
      summaryForTenant(tenantId),
      // "Já pago" e CAIXA: o financeiro pode ajustar o valor ao liquidar o saque
      // e o ajuste fica so no payout — somar comissoes PAID mostraria a esta
      // unidade menos do que ela recebeu de fato.
      prisma.referralPayout.aggregate({
        _sum: { amount: true },
        where: { referrerTenantId: tenantId, status: "PAID" },
      }),
      prisma.referralMonthlyCommission.findMany({
        where: { referrerTenantId: tenantId },
        orderBy: { period: "asc" },
        select: { period: true, amount: true },
      }),
      prisma.referralCommission.findMany({
        where: { referrerTenantId: tenantId },
        select: { amount: true, createdAt: true },
      }),
    ])

    const pago = Number(payoutsPaid._sum.amount ?? 0)

    const kpis: KpiDatum[] = [
      { key: "pending", label: "Pendente", value: summary.pending, format: "currency", icon: "clock" },
      { key: "available", label: "Disponível", value: summary.available, format: "currency", icon: "wallet" },
      {
        key: "paid",
        label: "Já pago (saques)",
        value: pago,
        format: "currency",
        icon: "circle-dollar-sign",
        hint: "Valor recebido nos saques liquidados",
      },
      { key: "generated", label: "Total gerado", value: summary.totalGenerated, format: "currency", icon: "share-2" },
      { key: "activeRef", label: "Indicados ativos", value: summary.activeReferrals, format: "number", icon: "store" },
      { key: "totalRef", label: "Total de indicados", value: summary.totalReferrals, format: "number", icon: "users" },
    ]

    // Comissão por mês (motor mensal + legado agregado por AAAA-MM).
    const byMonth = new Map<string, number>()
    for (const m of monthly) {
      byMonth.set(m.period, (byMonth.get(m.period) ?? 0) + Number(m.amount))
    }
    for (const l of legacyByMonth) {
      const key = `${l.createdAt.getFullYear()}-${String(l.createdAt.getMonth() + 1).padStart(2, "0")}`
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(l.amount))
    }
    const monthPoints = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([p, value]) => ({ x: p, value }))

    const series: ReportSeries[] = [
      {
        id: "by-status",
        kind: "donut",
        title: "Comissões por status (apuração)",
        // A fatia "Paga" e o valor APURADO das comissoes; o tile "Já pago" e o
        // caixa. Divergem quando o financeiro ajusta o valor do saque ao pagar.
        subtitle: "Valores apurados — o tile “Já pago” mostra o recebido",
        xKey: "x",
        series: [{ key: "value", label: "Valor", format: "currency" }],
        points: [
          { x: "Pendente", value: summary.pending },
          { x: "Disponível", value: summary.available },
          { x: "Paga", value: summary.paid },
          { x: "Cancelada", value: summary.cancelled },
        ],
      },
      {
        id: "by-month",
        kind: "bar",
        title: "Comissão gerada por mês",
        xKey: "x",
        series: [{ key: "value", label: "Comissão", format: "currency" }],
        points: monthPoints,
      },
    ]

    const tables: ReportTable[] = []

    // Bloco Rede — só para unidades que podem vender sub-revendas.
    if (canSellResellers) {
      const placar = await getReferralPlacarSnapshot(tenantId)
      series.push({
        id: "rede-funnel",
        kind: "funnel",
        title: "Sua rede de indicados",
        subtitle: "Status das unidades indicadas",
        xKey: "x",
        series: [{ key: "value", label: "Unidades", format: "number" }],
        points: [
          { x: "Aguardando", value: placar.funnel.aguardando },
          { x: "Ativas", value: placar.funnel.ativos },
          { x: "Suspensas", value: placar.funnel.suspensos },
          { x: "Canceladas", value: placar.funnel.cancelados },
        ],
      })
      tables.push({
        id: "rede-recentes",
        title: "Indicados recentes",
        columns: [{ key: "nome", label: "Unidade" }],
        rows: placar.recentes.map((r) => ({ nome: r.name })),
      })
    }

    return buildPayload(period, { kpis, series, tables })
  },
}
