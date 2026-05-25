import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.financeiro.overdue.list", route: "/api/admin/financeiro/overdue" },
  async () => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const now = new Date()

  const overdue = await prisma.tenantPayment.findMany({
    where: {
      status: { in: ["OVERDUE", "PENDING"] },
      dueDate: { lt: now },
      paidAt: null,
    },
    select: {
      id: true,
      amount: true,
      status: true,
      dueDate: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 50,
  })

  const rows = overdue.map((p) => {
    const daysLate = Math.max(
      0,
      Math.floor((now.getTime() - p.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    )
    return {
      id: p.id,
      tenantId: p.tenant.id,
      tenantName: p.tenant.name,
      tenantStatus: p.tenant.status,
      amount: Number(p.amount),
      daysLate,
      dueDate: p.dueDate.toISOString(),
    }
  })

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)

  return NextResponse.json({
    data: {
      rows,
      summary: {
        count: rows.length,
        totalAmount,
      },
    },
  })
  },
)
