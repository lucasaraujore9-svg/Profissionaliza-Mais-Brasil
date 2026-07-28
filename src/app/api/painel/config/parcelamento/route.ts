import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePainel } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { MAX_CARD_INSTALLMENTS } from "@/lib/mercadopago/installments"

const bodySchema = z.object({
  // Quantas parcelas sem juros a unidade anuncia (1 = só à vista sem juros).
  // O teto de parcelas oferecido continua sendo sempre 12x.
  interestFreeInstallments: z.number().int().min(1).max(MAX_CARD_INSTALLMENTS),
})

export const PATCH = withRequestContext(
  { action: "painel.config.parcelamento", route: "/api/painel/config/parcelamento" },
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
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const tenantId = ctx.tenantId

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { interestFreeInstallments: parsed.data.interestFreeInstallments },
      select: { id: true, slug: true, customDomain: true },
    })

    await invalidateTenant(updated)

    return NextResponse.json({
      data: { interestFreeInstallments: parsed.data.interestFreeInstallments },
    })
  },
)
