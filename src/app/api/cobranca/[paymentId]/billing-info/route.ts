import { NextResponse } from "next/server"
import { getBillingInfo, getPixQrCode, getPayment, AsaasApiError } from "@/lib/asaas/client"

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

    // Chama billingInfo (boleto/card) e pixQrCode em paralelo.
    // pixQrCode pode falhar com 400 se a conta não tem chave PIX — tratamos como null.
    const [billingResult, pixResult] = await Promise.allSettled([
      getBillingInfo(paymentId),
      getPixQrCode(paymentId),
    ])

    if (billingResult.status === "rejected") {
      throw billingResult.reason
    }

    const billingInfo = billingResult.value
    billingInfo.pix = pixResult.status === "fulfilled" ? pixResult.value : null

    return NextResponse.json({ data: billingInfo })
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ error: "Erro ao buscar informações de pagamento" }, { status: 502 })
  }
}
