import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  arrayToCsv,
  csvFilename,
  csvResponseHeaders,
  type CsvHeader,
} from "@/lib/csv"

export const dynamic = "force-dynamic"

interface UnitCommissionCsvRow extends Record<string, unknown> {
  direction: "RECEIVED" | "GENERATED"
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

const HEADERS: CsvHeader<UnitCommissionCsvRow>[] = [
  { key: "direction", label: "direction" },
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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await ctx.params

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
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

  const rows: UnitCommissionCsvRow[] = commissions.map((c) => ({
    direction: c.referrerTenantId === id ? "RECEIVED" : "GENERATED",
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
  const filename = csvFilename(`comissoes-${tenant.slug}`)

  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename),
  })
}
