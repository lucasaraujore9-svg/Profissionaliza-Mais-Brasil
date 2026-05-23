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

export const dynamic = "force-dynamic"

const ALLOWED_STATUS: ReferralCommissionStatus[] = [
  "PENDING",
  "AVAILABLE",
  "PAID",
  "CANCELLED",
]

interface CommissionCsvRow extends Record<string, unknown> {
  created_at: string
  referrer_name: string
  referrer_slug: string
  referred_name: string
  referred_slug: string
  tenant_payment_due_date: string
  base_amount: number
  percent: number
  amount: number
  status: string
  available_at: string
  paid_at: string
  payout_id: string
}

const HEADERS: CsvHeader<CommissionCsvRow>[] = [
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

export async function GET(request: Request) {
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

  if (status && ALLOWED_STATUS.includes(status as ReferralCommissionStatus)) {
    where.status = status as ReferralCommissionStatus
  }
  if (referrerId) where.referrerTenantId = referrerId
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
  }

  const commissions = await prisma.referralCommission.findMany({
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
  })

  const rows: CommissionCsvRow[] = commissions.map((c) => ({
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

  const csv = arrayToCsv(rows, HEADERS)
  const filename = csvFilename("comissoes")

  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename),
  })
}
