import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePainel } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  mode: z.enum(["AUTO", "MANUAL"]),
})

export const PATCH = withRequestContext(
  { action: "painel.config.billing_mode", route: "/api/painel/config/billing-mode" },
  async (request: Request) => {
    const guard = await requirePainel("gateway.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Modo inválido" },
        { status: 400 },
      )
    }

    const tenantId = ctx.tenantId

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { billingMode: parsed.data.mode },
      select: { id: true, slug: true, customDomain: true },
    })

    await invalidateTenant(updated)

    return NextResponse.json({ data: { billingMode: parsed.data.mode } })
  },
)
