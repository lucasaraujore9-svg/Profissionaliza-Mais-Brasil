import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Liga/desliga o módulo "Revender revendas" de uma unidade. Decisão comercial
// → restrito ao SUPER_ADMIN. Quando ligado, a unidade ganha o menu
// /painel/revendas e pode criar sub-revendas cobradas no Asaas da PMB.
const bodySchema = z.object({ enabled: z.boolean() })

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.can_sell_resellers.update",
    route: "/api/admin/tenants/[id]/can-sell-resellers",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("unidades.governanca")
    if (!guard.ok) return guard.response
    const session = guard.ctx
    const { id } = await context.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: { canSellResellers: parsed.data.enabled },
      select: { id: true, canSellResellers: true },
    })

    await logAudit({
      action: "tenant.can_sell_resellers",
      resource: "Tenant",
      resourceId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      tenantId: id,
      payloadAfter: { canSellResellers: updated.canSellResellers },
    })

    return NextResponse.json({ data: updated })
  },
)
