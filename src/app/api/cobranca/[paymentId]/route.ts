import { NextResponse } from "next/server"
import { getPayment, AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"

// TODO(segurança): a defesa ideal seria um token assinado por cobrança (HMAC/JWT)
// emitido no momento da criação da cobrança e validado aqui — eliminaria a
// possibilidade de enumeração mesmo sem rate-limit. Por ora, rate-limit por IP
// é suficiente para inviabilizar varredura automatizada sem quebrar o fluxo
// legítimo (cliente acessa com o paymentId que recebeu por e-mail/SMS).

export const GET = withRequestContextParams<{ paymentId: string }>(
  { action: "cobranca.get", route: "/api/cobranca/[paymentId]" },
  async (_request: Request, ctx) => {
  const rl = await rateLimit(_request, { name: "cobranca-get", limit: 20, windowSec: 60 })
  if (!rl.ok) return rateLimitResponse(rl)

  const { paymentId } = await ctx.params

  if (!(await isKnownAsaasPayment(paymentId))) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
  }

  try {
    const payment = await getPayment(paymentId)
    return NextResponse.json({
      data: {
        id: payment.id,
        status: payment.status,
        value: payment.value,
        dueDate: payment.dueDate,
        description: payment.description,
        billingType: payment.billingType,
      },
    })
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ error: "Erro ao buscar cobrança" }, { status: 502 })
  }
  },
)
