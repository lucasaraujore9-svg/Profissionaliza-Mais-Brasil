import { NextResponse } from "next/server"
import { z } from "zod"
import { getCardInstallments } from "@/lib/mercadopago/client"
import { getPmbMpAccessTokenAsync } from "@/lib/system-settings"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Parcelas reais do cartão para as vendas diretas da PMB (conta MP da PMB).
 * Espelha /api/loja/checkout/installments, mas usa o token PMB. Falha => lista
 * vazia (o checkout cai na síntese 1..12).
 */
const bodySchema = z.object({
  amount: z.number().positive().max(1_000_000),
  bin: z.string().regex(/^\d{6,8}$/),
})

export const POST = withRequestContext(
  { action: "checkout.installments", route: "/api/checkout/installments" },
  async (request: Request) => {
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

    try {
      const token = await getPmbMpAccessTokenAsync()
      if (!token) return NextResponse.json({ data: { payerCosts: [] } })
      const payerCosts = await getCardInstallments(token, {
        amount: parsed.data.amount,
        bin: parsed.data.bin.slice(0, 6),
      })
      return NextResponse.json({ data: { payerCosts } })
    } catch (error) {
      contextLogger().warn(
        { err: String(error), event: "checkout.installments.failed" },
        "falha ao consultar parcelas no MP (PMB) — checkout cai na síntese",
      )
      return NextResponse.json({ data: { payerCosts: [] } })
    }
  },
)
