import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  arrayToCsv,
  csvFilename,
  csvResponseHeaders,
  type CsvHeader,
} from "@/lib/csv"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import {
  linePercent,
  parseLinesSnapshot,
  type MonthlyCommissionLine,
} from "@/lib/referrals/lines-snapshot"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const dynamic = "force-dynamic"

// Marcador de dado inexistente no ledger de origem (nunca fabricamos valor).
const NA = "-"

interface UnitCommissionCsvRow extends Record<string, unknown> {
  direction: "RECEIVED" | "GENERATED"
  // "mensalidade" = ledger legado (ReferralCommission, 1 linha por mensalidade);
  // "fechamento mensal" = motor por faixas (ReferralMonthlyCommission).
  origem: string
  periodo: string
  created_at: string
  referrer_name: string
  referrer_slug: string
  referred_name: string
  referred_slug: string
  tenant_payment_due_date: string
  base_amount: number
  // FIXED paga R$/unidade e plano multi-fase grava rate 0 ("misto"): nao ha
  // percentual publicavel, entao a celula vira NA em vez de um 0 enganoso.
  percent: number | string
  amount: number
  status: string
  available_at: string
  paid_at: string
  payout_id: string
}

const HEADERS: CsvHeader<UnitCommissionCsvRow>[] = [
  { key: "direction", label: "direction" },
  { key: "origem", label: "origem" },
  { key: "periodo", label: "periodo" },
  { key: "created_at", label: "created_at" },
  { key: "referrer_name", label: "referrer_name" },
  { key: "referrer_slug", label: "referrer_slug" },
  { key: "referred_name", label: "referred_name" },
  { key: "referred_slug", label: "referred_slug" },
  { key: "tenant_payment_due_date", label: "tenant_payment_due_date" },
  { key: "base_amount", label: "base_amount" },
  { key: "percent", label: "percent" },
  { key: "amount", label: "amount" },
  { key: "status", label: "status" },
  { key: "available_at", label: "available_at" },
  { key: "paid_at", label: "paid_at" },
  { key: "payout_id", label: "payout_id" },
]

// Quebra por unidade gravada em ReferralMonthlyCommission.linesSnapshot.
// O type guard mora em @/lib/referrals/lines-snapshot (compartilhado com o PDF
// do demonstrativo, o CSV global e as telas do admin).
function percentCell(line: MonthlyCommissionLine): number | string {
  return linePercent(line) ?? NA
}

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.comissoes.export", route: "/api/admin/revendedores/[id]/comissoes/export" },
  async (_req: Request, ctx) => {
  const guard = await requireAdmin("unidades.comissoes")
  if (!guard.ok) return guard.response
  const session = guard.ctx

  const { id } = await ctx.params

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      accountManagerId: true,
      salesUserId: true,
      referrerTenantId: true,
    },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  // Mesmo escopo do irmao comissoes/demonstrativo: `unidades.comissoes` ja
  // decidiu QUEM baixa o CSV; aqui fica o recorte de QUAIS unidades — sem ele,
  // quem tem a permissao baixaria comissoes de qualquer revendedor por id.
  const allowed = await session.canAccessTenant(tenant)
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const commissions = await prisma.referralCommission.findMany({
    where: {
      OR: [{ referrerTenantId: id }, { referredTenantId: id }],
    },
    select: {
      createdAt: true,
      baseAmount: true,
      percent: true,
      amount: true,
      status: true,
      availableAt: true,
      paidAt: true,
      payoutId: true,
      referrerTenantId: true,
      referredTenantId: true,
      referrer: { select: { name: true, slug: true } },
      referred: { select: { name: true, slug: true } },
      tenantPayment: { select: { dueDate: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Motor por faixas (MONTHLY_TIERED): o dinheiro novo nasce aqui, agregado por
  // (indicador, mes). RECEIVED = fechamentos desta unidade como indicadora;
  // GENERATED = a participacao desta unidade no fechamento de quem a indicou.
  const monthlySelect = {
    createdAt: true,
    period: true,
    rateType: true,
    rate: true,
    baseSum: true,
    amount: true,
    status: true,
    availableAt: true,
    paidAt: true,
    payoutId: true,
    linesSnapshot: true,
    referrer: { select: { name: true, slug: true } },
  } as const

  const [monthlyReceived, monthlyGenerated] = await Promise.all([
    prisma.referralMonthlyCommission.findMany({
      where: { referrerTenantId: id },
      select: monthlySelect,
      orderBy: { createdAt: "desc" },
    }),
    tenant.referrerTenantId
      ? prisma.referralMonthlyCommission.findMany({
          where: { referrerTenantId: tenant.referrerTenantId },
          select: monthlySelect,
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ])

  // linesSnapshot guarda so tenantId/name — buscamos o slug real das unidades
  // citadas em vez de deixar a coluna vazia.
  const referredIds = new Set<string>()
  for (const m of monthlyReceived) {
    for (const line of parseLinesSnapshot(m.linesSnapshot)) {
      referredIds.add(line.tenantId)
    }
  }
  const referredTenants = referredIds.size
    ? await prisma.tenant.findMany({
        where: { id: { in: [...referredIds] } },
        select: { id: true, name: true, slug: true },
      })
    : []
  const referredById = new Map(referredTenants.map((t) => [t.id, t]))

  const legacyRows: UnitCommissionCsvRow[] = commissions.map((c) => ({
    direction: c.referrerTenantId === id ? "RECEIVED" : "GENERATED",
    origem: "mensalidade",
    periodo: NA,
    created_at: c.createdAt.toISOString(),
    referrer_name: c.referrer.name,
    referrer_slug: c.referrer.slug,
    referred_name: c.referred.name,
    referred_slug: c.referred.slug,
    tenant_payment_due_date: c.tenantPayment?.dueDate
      ? c.tenantPayment.dueDate.toISOString()
      : "",
    base_amount: Number(c.baseAmount),
    percent: Number(c.percent),
    amount: Number(c.amount),
    status: c.status,
    available_at: c.availableAt.toISOString(),
    paid_at: c.paidAt ? c.paidAt.toISOString() : "",
    payout_id: c.payoutId ?? "",
  }))

  const monthlyRows: UnitCommissionCsvRow[] = []

  for (const m of monthlyReceived) {
    const common = {
      origem: "fechamento mensal",
      periodo: m.period,
      created_at: m.createdAt.toISOString(),
      referrer_name: m.referrer.name,
      referrer_slug: m.referrer.slug,
      // Fechamento mensal nao aponta para uma mensalidade individual.
      tenant_payment_due_date: NA,
      status: m.status,
      available_at: m.availableAt.toISOString(),
      paid_at: m.paidAt ? m.paidAt.toISOString() : "",
      payout_id: m.payoutId ?? "",
    }

    const lines = parseLinesSnapshot(m.linesSnapshot)
    if (lines.length === 0) {
      // Sem quebra por unidade so resta o agregado do mes.
      monthlyRows.push({
        direction: "RECEIVED",
        ...common,
        referred_name: NA,
        referred_slug: NA,
        base_amount: Number(m.baseSum),
        // rate 0 no topo = plano multi-fase ("misto"): sem percentual unico.
        percent:
          m.rateType === "PERCENT" && Number(m.rate) > 0 ? Number(m.rate) : NA,
        amount: Number(m.amount),
      })
      continue
    }

    for (const line of lines) {
      const referred = referredById.get(line.tenantId)
      monthlyRows.push({
        direction: "RECEIVED",
        ...common,
        // Nome atual do tenant quando ele ainda existe; senao o do snapshot.
        referred_name: referred?.name ?? line.name,
        referred_slug: referred?.slug ?? NA,
        base_amount: line.mensalidade,
        percent: percentCell(line),
        amount: line.amount,
      })
    }
  }

  for (const m of monthlyGenerated) {
    // So as linhas em que ESTA unidade foi a indicada — o resto do fechamento
    // e de outras unidades da carteira do indicador.
    for (const line of parseLinesSnapshot(m.linesSnapshot)) {
      if (line.tenantId !== id) continue
      monthlyRows.push({
        direction: "GENERATED",
        origem: "fechamento mensal",
        periodo: m.period,
        created_at: m.createdAt.toISOString(),
        referrer_name: m.referrer.name,
        referrer_slug: m.referrer.slug,
        referred_name: tenant.name,
        referred_slug: tenant.slug,
        tenant_payment_due_date: NA,
        base_amount: line.mensalidade,
        percent: percentCell(line),
        amount: line.amount,
        status: m.status,
        available_at: m.availableAt.toISOString(),
        paid_at: m.paidAt ? m.paidAt.toISOString() : "",
        payout_id: m.payoutId ?? "",
      })
    }
  }

  // Uniao dos dois ledgers, mais recente primeiro. sort e estavel: empates
  // preservam a ordem de insercao (legado antes do fechamento mensal).
  const rows: UnitCommissionCsvRow[] = [...legacyRows, ...monthlyRows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const csv = arrayToCsv(rows, HEADERS)
  const filename = csvFilename(`comissoes-${tenant.slug}`)

  // SAAS-001: trilha de auditoria da exportação de comissões de uma unidade.
  await logAudit({
    action: "data.export",
    resource: "commissions",
    resourceId: id,
    actorUserId: session.userId,
    actorRole: session.role,
    tenantId: id,
    payloadAfter: {
      rows: rows.length,
      legacyRows: legacyRows.length,
      monthlyRows: monthlyRows.length,
      slug: tenant.slug,
    },
  })

  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename),
  })
  },
)
