import { NextResponse } from "next/server"
import { getPayment, AsaasApiError } from "@/lib/asaas/client"

interface Ctx {
  params: Promise<{ paymentId: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { paymentId } = await ctx.params

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
}
