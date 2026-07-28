import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.cupons.toggle", route: "/api/admin/cupons/[id]/toggle" },
  async (_req: Request, ctx) => {
  const guard = await requireAdmin("cupons.manage")
  if (!guard.ok) return guard.response

  const { id } = await ctx.params

  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, tenantId: true, isActive: true, createdByUserId: true },
  })
  if (!coupon || coupon.tenantId !== null) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
  // Sem `vendas.viewAll`, so o proprio cupom. Antes a checagem so valia quando
  // o papel era literalmente PMB_SALES, entao qualquer outro papel com
  // `cupons.manage` desativava o cupom ativo de outro vendedor por id.
  if (
    !guard.ctx.can("vendas.viewAll") &&
    coupon.createdByUserId !== guard.ctx.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const updated = await prisma.coupon.update({
    where: { id },
    data: { isActive: !coupon.isActive },
    select: { id: true, isActive: true },
  })

  // SAAS-001: trilha de auditoria do toggle de cupom global PMB.
  await logAudit({
    action: "coupon.toggle",
    resource: "Coupon",
    resourceId: id,
    actorUserId: guard.ctx.userId,
    actorRole: guard.ctx.role,
    payloadBefore: { isActive: coupon.isActive },
    payloadAfter: { isActive: updated.isActive },
  })

  return NextResponse.json({ data: updated })
  },
)
