import { NextResponse } from "next/server"
import { getBillingInfo, getPayment, AsaasApiError } from "@/lib/asaas/client"

interface Ctx {
  params: Promise<{ paymentId: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { paymentId } = await ctx.params

  try {
    const payment = await getPayment(paymentId)
    const payable = payment.status === "PENDING" || payment.status === "OVERDUE"
    if (!payable) {
      return NextResponse.json(
        { error: "Cobrança não está pendente de pagamento" },
        { status: 400 },
      )
    }

    const billingInfo = await getBillingInfo(paymentId)
    return NextResponse.json({ data: billingInfo })
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ error: "Erro ao buscar informações de pagamento" }, { status: 502 })
  }
}
