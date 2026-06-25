import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
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
    const session = await auth()
    if (
      !session?.user ||
      session.user.role !== "RESELLER" ||
      !session.user.tenantId
    ) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

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

    const tenantId = session.user.tenantId as string

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
