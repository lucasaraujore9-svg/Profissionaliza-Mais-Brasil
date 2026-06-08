import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  enabled: z.boolean(),
})

export const PATCH = withRequestContext(
  { action: "painel.config.mensalidade", route: "/api/painel/config/mensalidade" },
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

    // Só permite ativar se o Admin Master liberou a capacidade.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { monthlyAllowed: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 })
    }
    if (parsed.data.enabled && !tenant.monthlyAllowed) {
      return NextResponse.json(
        {
          error:
            "Pagamento parcelado não está liberado para sua unidade. Fale com seu gerente PMB.",
          code: "MONTHLY_NOT_ALLOWED",
        },
        { status: 403 },
      )
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { monthlyEnabled: parsed.data.enabled },
      select: { id: true, slug: true, customDomain: true },
    })

    await invalidateTenant(updated)

    return NextResponse.json({ data: { monthlyEnabled: parsed.data.enabled } })
  },
)
