import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

const ALLOWED_STATUS = new Set([
  "PENDING",
  "CONFIRMED",
  "RECEIVED",
  "OVERDUE",
  "REFUNDED",
])

export const GET = withRequestContext(
  { action: "admin.financeiro.tenant_payments.list", route: "/api/admin/financeiro/tenant-payments" },
  async (request: Request) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  // Financeiro de revendedores (mensalidades/asaasPaymentId/notas) e a tela
  // /admin/financeiro sao SUPER_ADMIN-only; alinha a API ao gate da UI.
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "all"
  const search = url.searchParams.get("search")?.trim() ?? ""
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const onlyManual = url.searchParams.get("manual") === "1"

  const where: Prisma.TenantPaymentWhereInput = {}

  if (status === "pendentes") {
    where.status = { in: ["PENDING", "CONFIRMED"] }
  } else if (status === "vencidos") {
    where.status = "OVERDUE"
  } else if (status === "recebidos") {
    where.status = { in: ["RECEIVED", "CONFIRMED"] }
  } else if (status === "marcados") {
    where.markedPaidAt = { not: null }
  } else if (status && status !== "all" && ALLOWED_STATUS.has(status.toUpperCase())) {
    where.status = status.toUpperCase()
  }

  // Cobranças DELETED (canceladas/removidas no Asaas) ficam fora por padrão —
  // só aparecem se explicitamente filtradas. Evita poluir a visão "all".
  if (where.status === undefined) {
    where.status = { not: "DELETED" }
  }

  if (onlyManual) {
    where.markedPaidAt = { not: null }
  }

  if (search) {
    where.tenant = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ],
    }
  }

  if (from || to) {
    const due: Prisma.DateTimeFilter = {}
    if (from) {
      const d = new Date(from)
      if (!Number.isNaN(d.getTime())) due.gte = d
    }
    if (to) {
      const d = new Date(to)
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        due.lte = d
      }
    }
    if (due.gte || due.lte) where.dueDate = due
  }

  const rows = await prisma.tenantPayment.findMany({
    where,
    select: {
      id: true,
      amount: true,
      billingType: true,
      status: true,
      dueDate: true,
      paidAt: true,
      invoiceUrl: true,
      notes: true,
      markedPaidAt: true,
      asaasPaymentId: true,
      tenant: { select: { id: true, name: true, slug: true } },
      markedPaidBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { dueDate: "desc" },
    take: 200,
  })

  return NextResponse.json({
    data: rows.map((p) => ({
      id: p.id,
      tenantId: p.tenant.id,
      tenantName: p.tenant.name,
      tenantSlug: p.tenant.slug,
      amount: Number(p.amount),
      billingType: p.billingType,
      status: p.status,
      dueDate: p.dueDate.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
      invoiceUrl: p.invoiceUrl,
      asaasPaymentId: p.asaasPaymentId,
      notes: p.notes,
      markedPaidAt: p.markedPaidAt?.toISOString() ?? null,
      markedPaidBy: p.markedPaidBy
        ? {
            id: p.markedPaidBy.id,
            name: p.markedPaidBy.name ?? p.markedPaidBy.email ?? "Admin",
          }
        : null,
      origin: p.markedPaidAt ? "MANUAL" : "ASAAS",
    })),
  })
  },
)
