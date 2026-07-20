import { NextResponse } from "next/server"
import type { Prisma, ReferralCommissionStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  arrayToCsv,
  csvFilename,
  csvResponseHeaders,
  type CsvHeader,
} from "@/lib/csv"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { MAX_EXPORT_ROWS, truncationNotice } from "@/lib/reports/export-limit"
import { logAudit } from "@/lib/audit"
import { linePercent, parseLinesSnapshot } from "@/lib/referrals/lines-snapshot"

export const dynamic = "force-dynamic"

const ALLOWED_STATUS: ReferralCommissionStatus[] = [
  "PENDING",
  "AVAILABLE",
  "PAID",
  "CANCELLED",
]

/** Ledger de origem da linha: (A) legado por mensalidade, (B) mensal por faixas. */
type CommissionOrigem = "LEGADO" | "MENSAL"

interface CommissionCsvRow extends Record<string, unknown> {
  origem: CommissionOrigem
  created_at: string
  periodo: string
  referrer_name: string
  referrer_slug: string
  referred_name: string
  referred_slug: string
  tenant_payment_due_date: string
  base_amount: number
  percent: number | string
  amount: number
  status: string
  available_at: string
  paid_at: string
  payout_id: string
}

const HEADERS: CsvHeader<CommissionCsvRow>[] = [
  { key: "origem", label: "origem" },
  { key: "created_at", label: "created_at" },
  { key: "periodo", label: "periodo" },
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

/** Linha + chave de ordenacao (nao vai para o CSV). */
interface SortableRow {
  sortTime: number
  row: CommissionCsvRow
}

export const GET = withRequestContext(
  { action: "admin.referrals.commissions.export", route: "/api/admin/referrals/commissions/export" },
  async (request: Request) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const referrerId =
    url.searchParams.get("referrerId") ?? url.searchParams.get("referrer")
  const referredId =
    url.searchParams.get("referredId") ?? url.searchParams.get("referred")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const daysParam = url.searchParams.get("days")

  const where: Prisma.ReferralCommissionWhereInput = {}
  // Ledger mensal nao tem referredTenantId nem tenantPayment: os filtros comuns
  // (status/indicador/periodo de criacao) sao espelhados aqui; o filtro por
  // unidade indicada e aplicado depois, sobre o linesSnapshot.
  const monthlyWhere: Prisma.ReferralMonthlyCommissionWhereInput = {}

  if (status && ALLOWED_STATUS.includes(status as ReferralCommissionStatus)) {
    where.status = status as ReferralCommissionStatus
    monthlyWhere.status = status as ReferralCommissionStatus
  }
  if (referrerId) {
    where.referrerTenantId = referrerId
    monthlyWhere.referrerTenantId = referrerId
  }
  if (referredId) where.referredTenantId = referredId

  const createdAtFilter: Prisma.DateTimeFilter = {}
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) createdAtFilter.gte = d
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      createdAtFilter.lte = d
    }
  }
  if (!from && !to && daysParam) {
    const days = Number(daysParam)
    if (Number.isFinite(days) && days > 0) {
      const since = new Date()
      since.setDate(since.getDate() - days)
      createdAtFilter.gte = since
    }
  }
  if (createdAtFilter.gte || createdAtFilter.lte) {
    where.createdAt = createdAtFilter
    monthlyWhere.createdAt = createdAtFilter
  }

  // Escopo por papel (espelha a pagina /admin/indicacoes e o financeiro
  // SUPER_ADMIN-only): PMB_SALES nao acessa comissoes de indicacao;
  // PMB_RESELLER_MGR so exporta comissoes de tenants atribuidos a ele.
  if (session.role === "PMB_SALES") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  if (session.role === "PMB_RESELLER_MGR") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { referrer: { accountManagerId: session.userId } },
    ]
    monthlyWhere.referrer = { accountManagerId: session.userId }
  }

  const [commissions, monthlyCommissions] = await Promise.all([
    prisma.referralCommission.findMany({
      where,
      select: {
        createdAt: true,
        baseAmount: true,
        percent: true,
        amount: true,
        status: true,
        availableAt: true,
        paidAt: true,
        payoutId: true,
        referrer: { select: { name: true, slug: true } },
        referred: { select: { name: true, slug: true } },
        tenantPayment: { select: { dueDate: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
    }),
    prisma.referralMonthlyCommission.findMany({
      where: monthlyWhere,
      select: {
        createdAt: true,
        period: true,
        rateType: true,
        rate: true,
        baseSum: true,
        amount: true,
        linesSnapshot: true,
        status: true,
        availableAt: true,
        paidAt: true,
        payoutId: true,
        referrer: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
    }),
  ])

  const entries: SortableRow[] = []

  for (const c of commissions) {
    entries.push({
      sortTime: c.createdAt.getTime(),
      row: {
        origem: "LEGADO",
        created_at: c.createdAt.toISOString(),
        periodo: "-",
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
      },
    })
  }

  for (const m of monthlyCommissions) {
    const createdAt = m.createdAt.toISOString()
    const availableAt = m.availableAt.toISOString()
    const paidAt = m.paidAt ? m.paidAt.toISOString() : ""
    const base = {
      origem: "MENSAL" as const,
      created_at: createdAt,
      periodo: m.period,
      referrer_name: m.referrer.name,
      referrer_slug: m.referrer.slug,
      // Slug da unidade indicada nao existe no snapshot mensal.
      referred_slug: "-",
      // Coluna exclusiva do ledger legado (vem de TenantPayment).
      tenant_payment_due_date: "-",
      status: m.status,
      available_at: availableAt,
      paid_at: paidAt,
      payout_id: m.payoutId ?? "",
    }

    const lines = parseLinesSnapshot(m.linesSnapshot).filter(
      (l) => !referredId || l.tenantId === referredId,
    )

    if (lines.length > 0) {
      for (const l of lines) {
        entries.push({
          sortTime: m.createdAt.getTime(),
          row: {
            ...base,
            referred_name: l.name,
            base_amount: l.mensalidade,
            // Percentual so faz sentido em faixa PERCENT; em FIXED o rate e R$/unidade.
            percent: linePercent(l) ?? "-",
            amount: l.amount,
          },
        })
      }
      continue
    }

    // Sem quebra por unidade utilizavel: cai para a linha agregada do mes. Se ha
    // filtro por unidade indicada, nao da para provar que o agregado pertence a
    // ela — a linha fica de fora.
    if (referredId) continue
    const rate = Number(m.rate)
    entries.push({
      sortTime: m.createdAt.getTime(),
      row: {
        ...base,
        referred_name: "-",
        base_amount: Number(m.baseSum),
        // rate = 0 no ledger mensal sinaliza "misto" (fases diferentes no mes).
        percent: m.rateType === "PERCENT" && rate > 0 ? rate : "-",
        amount: Number(m.amount),
      },
    })
  }

  // Ordenacao estavel do conjunto unido: mais recente primeiro; empates preservam
  // a ordem de insercao (legado antes do mensal, linhas do snapshot na ordem gravada).
  entries.sort((a, b) => b.sortTime - a.sortTime)

  const truncated =
    entries.length > MAX_EXPORT_ROWS ||
    commissions.length === MAX_EXPORT_ROWS ||
    monthlyCommissions.length === MAX_EXPORT_ROWS
  const rows: CommissionCsvRow[] = entries
    .slice(0, MAX_EXPORT_ROWS)
    .map((e) => e.row)

  let csv = arrayToCsv(rows, HEADERS)
  if (truncated) csv += `\n${truncationNotice()}`
  const filename = csvFilename("comissoes")

  // SAAS-001: trilha de auditoria da exportação de comissões de indicação.
  await logAudit({
    action: "data.export",
    resource: "commissions",
    actorUserId: session.userId,
    actorRole: session.role,
    payloadAfter: {
      rows: rows.length,
      filters: { status, referrerId, referredId, from, to, days: daysParam },
    },
  })

  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename),
  })
  },
)
