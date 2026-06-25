import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  decryptTenantMpToken,
  getCardInstallments,
  MPApiError,
} from "@/lib/mercadopago/client"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Parcelas reais do cartão para a vitrine da unidade. O browser envia o BIN
 * (6 dígitos) + valor; consultamos o MP com o access token DA UNIDADE e
 * devolvemos os payer_costs (valor de cada parcela, com/sem juros) — a fonte da
 * verdade do que será cobrado. Se o token/MP falhar, devolve lista vazia e o
 * checkout cai na síntese (1..12) — nunca derruba a tela.
 */
const bodySchema = z.object({
  amount: z.number().positive().max(1_000_000),
  bin: z.string().regex(/^\d{6,8}$/),
})

export const POST = withRequestContext(
  { action: "loja.checkout.installments", route: "/api/loja/checkout/installments" },
  async (request: Request) => {
    const tenantIdHeader = request.headers.get("x-tenant-id")
    const tenantSlug = request.headers.get("x-tenant-slug")
    if (!tenantIdHeader && !tenantSlug) {
      return NextResponse.json({ data: { payerCosts: [] } })
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

    const tenant = await prisma.tenant.findFirst({
      where: tenantIdHeader
        ? { id: tenantIdHeader }
        : { slug: tenantSlug ?? undefined },
      select: { mpAccessToken: true },
    })
    if (!tenant?.mpAccessToken) {
      return NextResponse.json({ data: { payerCosts: [], reason: "no_token" } })
    }

    try {
      const payerCosts = await getCardInstallments(
        decryptTenantMpToken(tenant.mpAccessToken),
        { amount: parsed.data.amount, bin: parsed.data.bin.slice(0, 6) },
      )
      return NextResponse.json({
        data: { payerCosts, reason: payerCosts.length ? "ok" : "empty" },
      })
    } catch (error) {
      contextLogger().warn(
        { err: String(error), event: "loja.checkout.installments.failed" },
        "falha ao consultar parcelas no MP — checkout cai na síntese",
      )
      const reason =
        error instanceof MPApiError ? `mp_error:${error.statusCode}` : "error"
      return NextResponse.json({ data: { payerCosts: [], reason } })
    }
  },
)
