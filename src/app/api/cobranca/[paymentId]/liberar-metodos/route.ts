import { NextResponse } from "next/server"
import { getPayment, updatePayment, AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

/**
 * Destrava uma cobrança presa a UM único meio de pagamento.
 *
 * O problema que isto resolve: a mensalidade gerada por uma assinatura de
 * CARTÃO nasce com `billingType: "CREDIT_CARD"`. Nessa forma o Asaas se recusa
 * a emitir QR de PIX (`GET /pixQrCode` responde 400) e não gera linha de
 * boleto. A tela de pagamento, que monta as abas a partir do `billingType`,
 * mostrava então uma aba só — "Cartão" —, e o cartão em questão é exatamente o
 * mesmo que o emissor vinha recusando (14 eventos
 * `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` em produção, em 6 unidades). Resultado:
 * a unidade abria o link para pagar, o cartão falhava, e não havia NENHUMA
 * outra forma de quitar. Quem tentava a aba PIX lia "Use o Boleto ou Cartão de
 * crédito" — conselho impossível de seguir, porque o boleto também não existia.
 *
 * `UNDEFINED` é o valor que o Asaas usa para "aceita qualquer meio": libera
 * PIX, boleto e cartão na mesma cobrança.
 *
 * NÃO toca em valor nem em vencimento — só amplia como se pode pagar. É por
 * isso que esta rota fica FORA do portão de cortesia excepcional
 * (`assertCortesiaExcepcional`), que existe para impedir que uma unidade que
 * nunca pagou ganhe desconto ou prazo. Aqui não há concessão: a dívida segue
 * idêntica, e a única mudança é o pagador conseguir quitá-la.
 *
 * Efeito colateral assumido: ao sair de `CREDIT_CARD`, o Asaas para de retentar
 * a captura automática no cartão salvo. É aceitável — e desejado — porque quem
 * chama isto está na tela de pagamento depois de o cartão já ter sido recusado.
 * Por isso a ação é EXPLÍCITA (um clique), nunca automática no GET: relaxar
 * toda cobrança de cartão que alguém abrisse desligaria a retentativa de
 * unidades cujo cartão ainda passaria na 2ª ou 3ª tentativa.
 *
 * Superfície pública, igual às outras rotas /cobranca (o link é enviado por
 * e-mail e não tem sessão): protegida por `isKnownAsaasPayment` — só ids de
 * cobranças que o sistema realmente rastreia — e por rate limit.
 */
export const POST = withRequestContextParams<{ paymentId: string }>(
  {
    action: "cobranca.liberar_metodos",
    route: "/api/cobranca/[paymentId]/liberar-metodos",
  },
  async (request: Request, ctx) => {
    const rl = await rateLimit(request, {
      name: "cobranca-liberar-metodos",
      limit: 5,
      windowSec: 60,
    })
    if (!rl.ok) return rateLimitResponse(rl)

    const { paymentId } = await ctx.params

    if (!(await isKnownAsaasPayment(paymentId))) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }

    try {
      const payment = await getPayment(paymentId)

      // Só cobrança ainda em aberto. Uma paga/estornada não se mexe.
      if (payment.status !== "PENDING" && payment.status !== "OVERDUE") {
        return NextResponse.json(
          { error: "Cobrança não está pendente de pagamento" },
          { status: 400 },
        )
      }

      // Já aceita tudo: idempotente, devolve sucesso sem chamar o Asaas de novo.
      if (payment.billingType === "UNDEFINED") {
        return NextResponse.json({
          data: { billingType: "UNDEFINED", changed: false },
        })
      }

      const updated = await updatePayment(paymentId, { billingType: "UNDEFINED" })

      // Espelha no ledger para o painel da unidade não seguir exibindo "Cartão"
      // numa cobrança que agora aceita PIX e boleto.
      const row = await prisma.tenantPayment.findUnique({
        where: { asaasPaymentId: paymentId },
        select: { id: true, tenantId: true },
      })
      if (row) {
        await prisma.tenantPayment
          .update({
            where: { asaasPaymentId: paymentId },
            data: { billingType: updated.billingType },
          })
          .catch(swallow("cobranca.liberar_metodos"))
      }

      await logAudit({
        action: "tenant_payment.billing_type.relax",
        resource: "TenantPayment",
        resourceId: row?.id ?? paymentId,
        actorRole: "SYSTEM",
        tenantId: row?.tenantId ?? null,
        payloadBefore: { billingType: payment.billingType },
        payloadAfter: { billingType: updated.billingType, asaasPaymentId: paymentId },
      })

      return NextResponse.json({
        data: { billingType: updated.billingType, changed: true },
      })
    } catch (error) {
      if (error instanceof AsaasApiError && error.statusCode === 404) {
        return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
      }
      contextLogger().error(
        { err: error, event: "cobranca.liberar_metodos.failed", paymentId },
        "falha ao liberar meios de pagamento da cobrança",
      )
      return NextResponse.json(
        { error: "Não foi possível liberar outras formas de pagamento agora." },
        { status: 502 },
      )
    }
  },
)
