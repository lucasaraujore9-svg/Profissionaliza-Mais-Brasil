import { NextResponse } from "next/server"
import { getBillingInfo, getPixQrCode, getPayment, AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { isChargePayable } from "@/lib/asaas/charge-status"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"

// TODO(segurança): ver comentário em ../route.ts — token por-cobrança seria
// a defesa ideal; rate-limit por IP cobre enumeração automatizada por ora.

export const GET = withRequestContextParams<{ paymentId: string }>(
  {
    action: "cobranca.billing_info",
    route: "/api/cobranca/[paymentId]/billing-info",
  },
  async (_request: Request, ctx) => {
  const rl = await rateLimit(_request, { name: "cobranca-get", limit: 20, windowSec: 60 })
  if (!rl.ok) return rateLimitResponse(rl)

  const { paymentId } = await ctx.params

  if (!(await isKnownAsaasPayment(paymentId))) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
  }

  try {
    const payment = await getPayment(paymentId)
    // `isChargePayable` também recusa a cobrança REMOVIDA no Asaas, que mantém
    // status PENDING (soft delete). Sem isso gerávamos um QR de PIX de uma
    // cobrança inexistente e o banco do pagador respondia "QR Code não é
    // válido".
    if (!isChargePayable(payment)) {
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
    // `fulfilled` NAO significa QR utilizavel: o Asaas devolve 200 com
    // `success: false` e strings vazias quando nao consegue gerar (chave PIX
    // ausente na conta, conta em analise). Passar isso adiante fazia a tela
    // desenhar `data:image/png;base64,` — imagem quebrada — e o botao copiar
    // devolver vazio. `null` e honesto: a tela ja sabe dizer "PIX indisponivel".
    const qr = pixResult.status === "fulfilled" ? pixResult.value : null
    billingInfo.pix = qr && qr.success && qr.payload ? qr : null

    return NextResponse.json({ data: billingInfo })
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ error: "Erro ao buscar informações de pagamento" }, { status: 502 })
  }
  },
)
