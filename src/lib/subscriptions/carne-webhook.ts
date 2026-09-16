import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { cancelPayment as cancelMpPayment } from "@/lib/mercadopago/client"
import type { MPPayment } from "@/lib/mercadopago/types"
import { revokeSubscriptionForRefund, settleSubscriptionCycle } from "./renew"
import { CARNE_STATUS, MP_CARNE_REF_PREFIX } from "./carne-schedule"

/**
 * Boleto da assinatura no boleto, no webhook do MERCADO PAGO
 * (`external_reference` = `subbol_<linha>`).
 *
 * Roteado pela LINHA, e nao pela assinatura, por causa do `cancelled`: no MP o
 * boleto que vence sem pagamento chega como `cancelled`, e o tratamento de
 * assinatura (`pmb_sub_`) le `cancelled` como estorno e revoga tudo. Aqui ele so
 * libera a linha para o cron reemitir o boleto.
 */

export interface MpCarneOutcome {
  ok: boolean
  note: string
}

export function isMpCarneReference(ref: string | null | undefined): boolean {
  return Boolean(ref?.startsWith(MP_CARNE_REF_PREFIX))
}

export async function handleMpCarnePayment(
  tenant: { id: string; isPmbVitrine?: boolean },
  /** Token JÁ DECIFRADO da conta que recebeu o webhook. */
  accessToken: string,
  payment: MPPayment,
): Promise<MpCarneOutcome> {
  const rowId = (payment.external_reference ?? "").slice(MP_CARNE_REF_PREFIX.length)
  const row = await prisma.subscriptionPayment.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      subscriptionId: true,
      tenantId: true,
      number: true,
      dueDate: true,
      paidAt: true,
      status: true,
      mpPaymentId: true,
    },
  })
  if (!row || row.number === null) {
    return { ok: true, note: `boleto de assinatura ${rowId} nao encontrado` }
  }
  // Anti cross-tenant: o boleto pertence à conta MP deste webhook.
  const expectedTenantId = tenant.isPmbVitrine ? null : tenant.id
  if (row.tenantId !== expectedTenantId) {
    return { ok: false, note: `boleto de assinatura ${rowId} de outro tenant` }
  }

  const paymentId = String(payment.id)
  const label = `assinatura ${row.subscriptionId}: boleto ${row.number}`

  if (payment.status === "approved") {
    if (!row.paidAt && row.mpPaymentId !== paymentId) {
      // Pagaram um boleto ANTERIOR desta linha (vencido e já reemitido). É ele
      // que vale: a linha passa a apontar para ele e o boleto novo é cancelado,
      // para ninguém pagar o mesmo ciclo duas vezes.
      const replaced = row.mpPaymentId
      await prisma.subscriptionPayment.update({
        where: { id: row.id },
        data: { mpPaymentId: paymentId },
      })
      if (replaced) {
        await cancelMpPayment(accessToken, replaced).catch((err) => {
          contextLogger().warn(
            { err, event: "subscription.carne.mp_replaced_cancel_failed", rowId: row.id, replaced },
            "boleto reemitido não pôde ser cancelado — o aluno pode pagar em dobro",
          )
        })
      }
    }
    const { settled } = await settleSubscriptionCycle(row.subscriptionId, {
      gateway: "MP",
      externalPaymentId: paymentId,
      amount: payment.transaction_amount,
      paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
      dueDate: row.dueDate,
      billingType: "BOLETO",
    })
    return { ok: true, note: settled ? `${label} pago` : `${label} ja registrado` }
  }

  if (payment.status === "refunded" || payment.status === "charged_back") {
    // Estorno de verdade: sem carência, como em qualquer assinatura.
    await revokeSubscriptionForRefund(row.subscriptionId)
    return { ok: true, note: `${label} ${payment.status}` }
  }

  if (payment.status === "cancelled" || payment.status === "rejected") {
    // Boleto que venceu sem pagamento. Se ainda é o boleto desta linha (e a
    // linha não foi cancelada por nós), libera para reemissão.
    if (
      !row.paidAt &&
      row.mpPaymentId === paymentId &&
      row.status !== CARNE_STATUS.CANCELLED
    ) {
      await prisma.subscriptionPayment.update({
        where: { id: row.id },
        data: {
          status: CARNE_STATUS.OVERDUE,
          mpPaymentId: null,
          bankSlipUrl: null,
          digitableLine: null,
        },
      })
      return { ok: true, note: `${label} expirou — sera reemitido` }
    }
    return { ok: true, note: `${label} ${payment.status} — sem acao` }
  }

  // pending / in_process: boleto emitido aguardando pagamento.
  return { ok: true, note: `${label} status=${payment.status}` }
}
