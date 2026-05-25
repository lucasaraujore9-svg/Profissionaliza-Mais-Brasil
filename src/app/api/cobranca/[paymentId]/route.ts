import { NextResponse } from "next/server"
import { getPayment, AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ paymentId: string }>(
  { action: "cobranca.get", route: "/api/cobranca/[paymentId]" },
  async (_request: Request, ctx) => {
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
