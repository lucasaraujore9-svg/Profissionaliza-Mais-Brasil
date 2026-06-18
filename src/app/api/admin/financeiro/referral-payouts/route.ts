import { NextResponse } from "next/server"
import type { Prisma, ReferralPayoutStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

const ALLOWED_STATUS: ReferralPayoutStatus[] = [
  "REQUESTED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
]

export const GET = withRequestContext(
  { action: "admin.financeiro.referral_payouts.list", route: "/api/admin/financeiro/referral-payouts" },
  async (request: Request) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "all"
  const search = url.searchParams.get("search")?.trim() ?? ""
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const where: Prisma.ReferralPayoutWhereInput = {}

  if (status && status !== "all") {
    const upper = status.toUpperCase() as ReferralPayoutStatus
    if (ALLOWED_STATUS.includes(upper)) {
      where.status = upper
    } else if (status === "pendentes") {
      where.status = { in: ["REQUESTED", "PROCESSING"] }
    }
  }

  if (search) {
    where.referrer = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ],
    }
  }

  if (from || to) {
    const filter: Prisma.DateTimeFilter = {}
    if (from) {
      const d = new Date(from)
      if (!Number.isNaN(d.getTime())) filter.gte = d
    }
    if (to) {
      const d = new Date(to)
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        filter.lte = d
      }
    }
    if (filter.gte || filter.lte) where.requestedAt = filter
  }

  // Escopo por papel (espelha a pagina /admin/indicacoes/saques): allowlist
  // explicita — só SUPER_ADMIN, PMB_FINANCEIRO e PMB_RESELLER_MGR veem saques.
  // PIX/valores/transferId são PII financeira; um deny-list (só 403 PMB_SALES)
  // vazava tudo para PMB_SALES_MGR e PMB_REVENDA_SALES, que caíam no fallback
  // sem filtro. PMB_RESELLER_MGR continua restrito aos tenants que gerencia.
  if (
    session.role !== "SUPER_ADMIN" &&
    session.role !== "PMB_FINANCEIRO" &&
    session.role !== "PMB_RESELLER_MGR"
  ) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  if (session.role === "PMB_RESELLER_MGR") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { referrer: { accountManagerId: session.userId } },
    ]
  }

  const rows = await prisma.referralPayout.findMany({
    where,
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      pixKey: true,
      pixKeyType: true,
      asaasTransferId: true,
      failureReason: true,
      notes: true,
      requestedAt: true,
      processedAt: true,
      paidAt: true,
      proofUrl: true,
      proofUploadedAt: true,
      referrer: { select: { id: true, name: true, slug: true } },
      markedPaidBy: { select: { id: true, name: true, email: true } },
      _count: { select: { commissions: true, monthlyCommissions: true } },
      commissions: {
        select: {
          id: true,
          amount: true,
          baseAmount: true,
          percent: true,
          status: true,
          referred: { select: { id: true, name: true, slug: true } },
        },
        take: 50,
        orderBy: { createdAt: "desc" },
      },
      // Comissoes do motor por faixas (MONTHLY_TIERED) liquidadas neste payout.
      monthlyCommissions: {
        select: {
          id: true,
          period: true,
          rateType: true,
          bracketBasis: true,
          payoutBase: true,
          bracketCount: true,
          rate: true,
          unitCount: true,
          baseSum: true,
          amount: true,
          status: true,
        },
        take: 24,
        orderBy: { period: "desc" },
      },
    },
    orderBy: { requestedAt: "desc" },
    take: 200,
  })

  return NextResponse.json({
    data: rows.map((p) => ({
      id: p.id,
      referrerId: p.referrer.id,
      referrerName: p.referrer.name,
      referrerSlug: p.referrer.slug,
      amount: Number(p.amount),
      method: p.method,
      status: p.status,
      pixKey: p.pixKey,
      pixKeyType: p.pixKeyType,
      asaasTransferId: p.asaasTransferId,
      failureReason: p.failureReason,
      notes: p.notes,
      requestedAt: p.requestedAt.toISOString(),
      processedAt: p.processedAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      proofUrl: p.proofUrl,
      proofUploadedAt: p.proofUploadedAt?.toISOString() ?? null,
      commissionCount: p._count.commissions,
      monthlyCommissionCount: p._count.monthlyCommissions,
      commissions: p.commissions.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        baseAmount: Number(c.baseAmount),
        percent: Number(c.percent),
        status: c.status,
        referredId: c.referred.id,
        referredName: c.referred.name,
        referredSlug: c.referred.slug,
      })),
      monthlyCommissions: p.monthlyCommissions.map((m) => ({
        id: m.id,
        period: m.period,
        rateType: m.rateType,
        bracketBasis: m.bracketBasis,
        payoutBase: m.payoutBase,
        bracketCount: m.bracketCount,
        rate: Number(m.rate),
        unitCount: m.unitCount,
        baseSum: Number(m.baseSum),
        amount: Number(m.amount),
        status: m.status,
      })),
      markedPaidBy: p.markedPaidBy
        ? {
            id: p.markedPaidBy.id,
            name: p.markedPaidBy.name ?? p.markedPaidBy.email ?? "Admin",
          }
        : null,
    })),
  })
  },
)
