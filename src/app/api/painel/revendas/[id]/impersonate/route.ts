import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSeller } from "@/lib/auth/guards"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

// POST /api/painel/revendas/[id]/impersonate — o revendedor-vendedor acessa o
// painel de uma SUB-REVENDA que ele trouxe (suporte). Só pode impersonar revendas
// cujo referrerTenantId é a própria unidade vendedora.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.revendas.impersonate", route: "/api/painel/revendas/[id]/impersonate" },
  async (_request: Request, { params }) => {
    const guard = await requireResellerSeller()
    if (!guard.ok) return guard.response
    const sellerTenantId = guard.tenantId

    const { id: subTenantId } = await params
    const sub = await prisma.tenant.findUnique({
      where: { id: subTenantId },
      select: { id: true, name: true, referrerTenantId: true },
    })
    if (!sub || sub.referrerTenantId !== sellerTenantId) {
      return NextResponse.json({ error: "Revenda não encontrada" }, { status: 404 })
    }

    const owner = await prisma.user.findFirst({
      where: { tenantId: sub.id, role: "RESELLER" },
      select: { id: true, name: true, email: true, role: true, tenantId: true },
      orderBy: { createdAt: "asc" },
    })
    if (!owner) {
      return NextResponse.json(
        { error: "Esta revenda ainda não tem responsável" },
        { status: 400 },
      )
    }

    await startImpersonation({
      target: {
        sub: owner.id,
        role: owner.role,
        tenantId: owner.tenantId,
        email: owner.email,
        name: owner.name,
      },
      actor: { userId: guard.session.userId },
      targetLabel: owner.name ?? owner.email ?? sub.name,
    })

    await logAudit({
      action: "impersonation.start",
      resource: "Tenant",
      resourceId: sub.id,
      actorUserId: guard.session.userId,
      actorRole: guard.session.role,
      tenantId: sub.id,
      payloadAfter: { targetUserId: owner.id, via: "reseller_seller" },
    })

    return NextResponse.json({ data: { redirect: "/painel" } })
  },
)
