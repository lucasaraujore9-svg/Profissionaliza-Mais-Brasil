import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.cupons.toggle", route: "/api/painel/cupons/[id]/toggle" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    const coupon = await prisma.coupon.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, isActive: true },
    })
    if (!coupon) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 })
    }

    const updated = await prisma.coupon.update({
      where: { id: coupon.id },
      data: { isActive: !coupon.isActive },
      select: { id: true, isActive: true },
    })

    return NextResponse.json({ data: updated })
  },
)
