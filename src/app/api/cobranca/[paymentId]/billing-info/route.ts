import { NextResponse } from "next/server"
import { getBillingInfo, getPixQrCode, getPayment, AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ paymentId: string }>(
  {
    action: "cobranca.billing_info",
    route: "/api/cobranca/[paymentId]/billing-info",
  },
  async (_request: Request, ctx) => {
  const { paymentId } = await ctx.params

  if (!(await isKnownAsaasPayment(paymentId))) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
  }

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
  },
)
