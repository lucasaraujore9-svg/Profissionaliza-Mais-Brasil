import { prisma } from "@/lib/prisma"
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
    // Recorte do dinheiro: sem visão financeira do ecossistema, só as unidades
    // da própria carteira — no formato do papel (accountManagerId, salesUserId
    // ou time), resolvido pelo guard e não re-derivado aqui.
    //
    // `null` significa "não alcança unidade nenhuma" e tem de FECHAR. Colapsar
    // `null` e `{}` no mesmo "sem filtro" era fail-open: revogar
    // `unidades.view` de um gerente devolvia o ledger da rede inteira, a mesma
    // inversão ("revogar amplia") que o comissoesScope existe para fechar.
    const referrerFilter = await session.comissoesScope()
    if (!referrerFilter) return buildPayload(period, {})
    const scope =
      Object.keys(referrerFilter).length > 0 ? { referrer: referrerFilter } : {}
    const range = { gte: period.start, lt: period.end }

    const [
      legacyInRange,
      monthlyInRange,
      available,
      payoutsPaid,
      legacyByStatus,
      monthlyByStatus,
      legacyTotal,
      monthlyTotal,
      topReferrersRaw,
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
      // Recortado por `paidAt` no periodo, como os demais KPIs: sem isso um
      // total de caixa VITALICIO aparecia ao lado de valores do mes, e o
      // relatorio de um mes fechado nunca mudava de valor.
      prisma.referralPayout.aggregate({
        _sum: { amount: true },
        where: {
          status: "PAID",
          paidAt: range,
          ...scope,
        },
      }),
      prisma.referralCommission.groupBy({ by: ["status"], where: scope, _sum: { amount: true } }),
      prisma.referralMonthlyCommission.groupBy({ by: ["status"], where: scope, _sum: { amount: true } }),
      prisma.referralCommission.aggregate({ _sum: { amount: true }, where: scope }),
      prisma.referralMonthlyCommission.aggregate({ _sum: { amount: true }, where: scope }),
      // Sem `take` nos groupBy: o top real só existe depois de somar os dois
      // motores por indicador — cortar antes descartaria quem lidera na soma.
      Promise.all([
        prisma.referralCommission.groupBy({
          by: ["referrerTenantId"],
          where: { ...scope, createdAt: range },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
        }),
        prisma.referralMonthlyCommission.groupBy({
          by: ["referrerTenantId"],
          where: { ...scope, createdAt: range },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
        }),
      ]),
      prisma.referralPayout.findMany({
        where: scope,
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
    // "Pago" e CAIXA, nao apuracao: sai de ReferralPayout PAID. O financeiro pode
    // ajustar o valor na hora de liquidar o saque, e esse ajuste vive so no
    // payout — somar as comissoes PAID reportaria menos do que saiu do caixa.
    const pago = Number(payoutsPaid._sum.amount ?? 0)

    // Status combinado (ambos os motores) — apuracao pura.
    const statusMap = new Map<string, number>()
    for (const r of [...legacyByStatus, ...monthlyByStatus]) {
      statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + Number(r._sum.amount ?? 0))
    }

    const kpis: KpiDatum[] = [
      { key: "gerado", label: "Geradas no período", value: gerado, format: "currency", icon: "share-2" },
      {
        key: "pendente",
        label: "Pendente",
        value: statusMap.get("PENDING") ?? 0,
        format: "currency",
        icon: "clock",
        hint: "Apurado, ainda não liberado",
      },
      {
        key: "disponivel",
        label: "Disponível a pagar",
        value: disponivel,
        format: "currency",
        icon: "wallet",
        hint: "Apurado e liberado para saque",
      },
      {
        key: "pago",
        label: "Pago (saques liquidados)",
        value: pago,
        format: "currency",
        icon: "circle-dollar-sign",
        hint: "Caixa: transferido no período",
      },
    ]

    const series: ReportSeries[] = [
      {
        id: "by-status",
        kind: "bar",
        title: "Comissões por status (apuração)",
        // A fatia "Paga" e o valor APURADO; o KPI "Pago" e o caixa. Divergem
        // sempre que o financeiro ajusta o valor ao liquidar o saque.
        subtitle: "Valor apurado pelo motor — o KPI “Pago” mostra o caixa",
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

    // Top indicadores por comissão — soma dos dois motores por indicador.
    const [legacyByReferrer, monthlyByReferrer] = topReferrersRaw
    const referrerTotals = new Map<string, number>()
    for (const r of [...legacyByReferrer, ...monthlyByReferrer]) {
      referrerTotals.set(
        r.referrerTenantId,
        (referrerTotals.get(r.referrerTenantId) ?? 0) + Number(r._sum.amount ?? 0),
      )
    }
    const topReferrers = [...referrerTotals.entries()]
      .map(([referrerTenantId, valor]) => ({ referrerTenantId, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)

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
          valor: r.valor,
        })),
      },
      {
        id: "saques",
        title: "Saques recentes",
        subtitle: "Valor de caixa — os liquidados somam o KPI “Pago”",
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
