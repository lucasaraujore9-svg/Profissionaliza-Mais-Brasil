import { NextResponse } from "next/server"
import { z } from "zod"
import { AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { convertChargeToCardSubscription } from "@/lib/tenant-billing/card-subscription"
import { contextLogger } from "@/lib/logger"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { clientIp } from "@/lib/http/client-ip"

/**
 * POST /api/cobranca/[paymentId]/assinar-cartao
 *
 * A unidade troca a mensalidade mês a mês (R$ 329) pelo débito automático no
 * cartão (R$ 289). Núcleo em lib/tenant-billing/card-subscription.ts. Mesma
 * superfície pública das outras rotas /cobranca: `isKnownAsaasPayment` + rate
 * limit (o bucket do pay-card, para não somar dois tetos no mesmo cartão).
 */

const bodySchema = z.object({
  creditCard: z.object({
    holderName: z.string().trim().min(1),
    number: z.string().min(13).max(23),
    expiryMonth: z.string().regex(/^\d{2}$/),
    expiryYear: z.string().regex(/^\d{4}$/),
    ccv: z.string().regex(/^\d{3,4}$/),
  }),
  creditCardHolderInfo: z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    cpfCnpj: z.string().min(11).max(18),
    postalCode: z.string().min(8).max(9),
    addressNumber: z.string().trim().min(1),
    addressComplement: z.string().optional(),
    phone: z.string().min(10).max(15),
    mobilePhone: z.string().optional(),
  }),
})

const digits = (s: string) => s.replace(/\D/g, "")

export const POST = withRequestContextParams<{ paymentId: string }>(
  { action: "cobranca.assinar_cartao", route: "/api/cobranca/[paymentId]/assinar-cartao" },
  async (request: Request, ctx) => {
    const rl = await rateLimit(request, RATE_LIMITS.cobrancaPayCard)
    if (!rl.ok) return rateLimitResponse(rl)

    const { paymentId } = await ctx.params
    if (!(await isKnownAsaasPayment(paymentId))) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { creditCard, creditCardHolderInfo: h } = parsed.data

    try {
      const result = await convertChargeToCardSubscription({
        paymentId,
        creditCard: { ...creditCard, number: digits(creditCard.number) },
        creditCardHolderInfo: {
          ...h,
          cpfCnpj: digits(h.cpfCnpj),
          postalCode: digits(h.postalCode),
          phone: digits(h.phone),
          mobilePhone: h.mobilePhone ? digits(h.mobilePhone) : undefined,
        },
        remoteIp: clientIp(request),
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json({
        data: { status: result.status, value: result.value, pending: result.pending },
      })
    } catch (error) {
      if (error instanceof AsaasApiError && error.statusCode === 404) {
        return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
      }
      contextLogger().error(
        { err: error, event: "cobranca.assinar_cartao.failed", paymentId },
        "falha ao migrar mensalidade para o débito automático",
      )
      return NextResponse.json({ error: "Erro ao processar pagamento" }, { status: 502 })
    }
  },
)
