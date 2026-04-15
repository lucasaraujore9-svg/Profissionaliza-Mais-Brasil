import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

export async function GET(request: Request) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const status = searchParams.get("status")?.trim().toUpperCase() ?? ""

  const where: Prisma.TenantWhereInput = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { owner: { email: { contains: q, mode: "insensitive" } } },
    ]
  }
  if (status && ["ACTIVE", "PENDING", "SUSPENDED", "CANCELLED"].includes(status)) {
    where.status = status as Prisma.TenantWhereInput["status"]
  }

  // Escopo: PMB_RESELLER_MGR ve so seus. SUPER_ADMIN ve todos.
  // PMB_SALES nao entra aqui (via sidebar ja filtrado), mas se chegar, nao devolve nada.
  if (ctx.role === "PMB_RESELLER_MGR") {
    where.accountManagerId = ctx.userId
  } else if (ctx.role === "PMB_SALES") {
    where.id = "__none__"
  } else {
    const managerFilter = searchParams.get("manager")?.trim()
    if (managerFilter === "unassigned") where.accountManagerId = null
    else if (managerFilter) where.accountManagerId = managerFilter
  }

  const [tenants, stats] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planValue: true,
        createdAt: true,
        owner: { select: { email: true } },
        accountManagerId: true,
        accountManager: { select: { id: true, name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.tenant.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: ctx.role === "PMB_RESELLER_MGR" ? { accountManagerId: ctx.userId } : undefined,
    }),
  ])

  const statsMap: Record<string, number> = {
    ACTIVE: 0,
    PENDING: 0,
    SUSPENDED: 0,
    CANCELLED: 0,
  }
  for (const row of stats) {
    statsMap[row.status] = row._count._all
  }

  const total = Object.values(statsMap).reduce((a, b) => a + b, 0)

  return NextResponse.json({
    data: {
      stats: {
        total,
        active: statsMap.ACTIVE,
        pending: statsMap.PENDING,
        suspended: statsMap.SUSPENDED,
        cancelled: statsMap.CANCELLED,
      },
      resellers: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        email: t.owner?.email ?? null,
        mrr: Number(t.planValue),
        students: t._count.students,
        accountManagerId: t.accountManagerId,
        accountManagerName: t.accountManager?.name ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      role: ctx.role,
    },
  })
}
