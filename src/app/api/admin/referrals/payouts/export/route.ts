import { NextResponse } from "next/server"
import type { Prisma, ReferralPayoutStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  arrayToCsv,
  csvFilename,
  csvResponseHeaders,
  type CsvHeader,
} from "@/lib/csv"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"

const ALLOWED_STATUS: ReferralPayoutStatus[] = [
  "REQUESTED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
]

interface PayoutCsvRow extends Record<string, unknown> {
  requested_at: string
  referrer_name: string
  referrer_slug: string
  amount: number
  method: string
  status: string
  pix_key: string
  pix_key_type: string
  asaas_transfer_id: string
  paid_at: string
  marked_paid_by: string
  notes: string
}

const HEADERS: CsvHeader<PayoutCsvRow>[] = [
  { key: "requested_at", label: "requested_at" },
  { key: "referrer_name", label: "referrer_name" },
  { key: "referrer_slug", label: "referrer_slug" },
  { key: "amount", label: "amount" },
  { key: "method", label: "method" },
  { key: "status", label: "status" },
  { key: "pix_key", label: "pix_key" },
  { key: "pix_key_type", label: "pix_key_type" },
  { key: "asaas_transfer_id", label: "asaas_transfer_id" },
  { key: "paid_at", label: "paid_at" },
  { key: "marked_paid_by", label: "marked_paid_by" },
  { key: "notes", label: "notes" },
]

export const GET = withRequestContext(
  { action: "admin.referrals.payouts.export", route: "/api/admin/referrals/payouts/export" },
  async (request: Request) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "all"
  const search = url.searchParams.get("search")?.trim() ?? ""
  const referrerId = url.searchParams.get("referrerId")
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

  if (referrerId) {
    where.referrerTenantId = referrerId
  } else if (search) {
    where.referrer = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ],
    }
  }

  const dateFilter: Prisma.DateTimeFilter = {}
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) dateFilter.gte = d
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      dateFilter.lte = d
    }
  }
  if (dateFilter.gte || dateFilter.lte) {
    where.requestedAt = dateFilter
  }

  const payouts = await prisma.referralPayout.findMany({
    where,
    select: {
      requestedAt: true,
      amount: true,
      method: true,
      status: true,
      pixKey: true,
      pixKeyType: true,
      asaasTransferId: true,
      paidAt: true,
      notes: true,
      referrer: { select: { name: true, slug: true } },
      markedPaidBy: { select: { name: true, email: true } },
    },
    orderBy: { requestedAt: "desc" },
  })

  const rows: PayoutCsvRow[] = payouts.map((p) => ({
    requested_at: p.requestedAt.toISOString(),
    referrer_name: p.referrer.name,
    referrer_slug: p.referrer.slug,
    amount: Number(p.amount),
    method: p.method,
    status: p.status,
    pix_key: p.pixKey ?? "",
    pix_key_type: p.pixKeyType ?? "",
    asaas_transfer_id: p.asaasTransferId ?? "",
    paid_at: p.paidAt ? p.paidAt.toISOString() : "",
    marked_paid_by:
      p.markedPaidBy?.name ?? p.markedPaidBy?.email ?? "",
    notes: p.notes ?? "",
  }))

  const csv = arrayToCsv(rows, HEADERS)
  const filename = csvFilename("saques-indicacao")

  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename),
  })
  },
)
