import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const { id } = await ctx.params

  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, tenantId: true, isActive: true, createdByUserId: true },
  })
  if (!coupon || coupon.tenantId !== null) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
  if (
    guard.session.role === "PMB_SALES" &&
    coupon.createdByUserId !== guard.session.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const updated = await prisma.coupon.update({
    where: { id },
    data: { isActive: !coupon.isActive },
    select: { id: true, isActive: true },
  })

  return NextResponse.json({ data: updated })
}
