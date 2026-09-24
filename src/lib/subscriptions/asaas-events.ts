import { prisma } from "@/lib/prisma"
import type { AsaasPayment } from "@/lib/asaas/types"
import {
  markSubscriptionPastDue,
  recordOpenSubscriptionCharge,
  revokeSubscriptionForRefund,
  settleSubscriptionCycle,
} from "./renew"
import { CARNE_STATUS } from "./carne-schedule"

/**
 * Evento de cobranca do Asaas numa ASSINATURA DE ALUNO — a MESMA decisao para a
 * conta-mae (`asaas/process.ts`) e para a conta da unidade
 * (`asaas/reseller-process.ts`).
 *
 * Era uma copia em cada processador, e as copias ja tinham divergido: a da
 * unidade so achava a assinatura pelo `subscription` do Asaas, entao a cobranca
 * AVULSA de uma unidade (acesso vitalicio, boleto do carne) — que chega com a
 * referencia `pmb_sub_<id>` e sem `subscription` — caia em "matricula nao
 * encontrada" e o aluno pagava sem nunca ter acesso.
 *
 * Devolve a nota do WebhookLog.
 */

type AsaasEventPayment = Pick<
  AsaasPayment,
  "id" | "value" | "paymentDate" | "dueDate" | "billingType" | "invoiceUrl" | "bankSlipUrl"
>

export async function applyAsaasSubscriptionEvent(
  subscription: { id: string; boletoCarne: boolean },
  event: string,
  payment: AsaasEventPayment,
): Promise<string> {
  const subscriptionId = subscription.id
  const charge = {
    gateway: "ASAAS" as const,
    externalPaymentId: payment.id,
    amount: payment.value,
    dueDate: new Date(payment.dueDate),
    billingType: payment.billingType,
    invoiceUrl: payment.invoiceUrl,
    bankSlipUrl: payment.bankSlipUrl,
  }

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const { settled } = await settleSubscriptionCycle(subscriptionId, {
      ...charge,
      paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
    })
    return settled
      ? `assinatura ${subscriptionId}: ciclo liquidado`
      : `assinatura ${subscriptionId}: ciclo ja registrado`
  }

  if (event === "PAYMENT_OVERDUE") {
    // Grava a fatura ANTES de marcar o atraso: é este link que a área do
    // aluno mostra para ele regularizar dentro da carência.
    await recordOpenSubscriptionCharge(subscriptionId, { ...charge, status: "OVERDUE" })
    // No CARNÊ o atraso do boleto não mexe no status: quem decide é o fim do
    // período pago (varredura diária), igual no Mercado Pago — que nem avisa
    // atraso. Marcar aqui faria as duas pontas divergirem.
    if (!subscription.boletoCarne) {
      // Só MARCA. Quem corta é o cron, depois da carência — revogar aqui
      // apagaria o progresso na EA de quem se atrasou um dia.
      await markSubscriptionPastDue(subscriptionId)
    }
    return `assinatura ${subscriptionId}: em atraso`
  }

  if (event === "PAYMENT_CREATED" || event === "PAYMENT_UPDATED") {
    // Ciclo novo emitido pela recorrência: guarda o link de pagamento.
    await recordOpenSubscriptionCharge(subscriptionId, { ...charge, status: "PENDING" })
    return `assinatura ${subscriptionId}: cobranca em aberto registrada`
  }

  if (event === "PAYMENT_DELETED" && subscription.boletoCarne) {
    // Boleto do carnê removido (por nós, ao cancelar, ou à mão no painel do
    // Asaas). A remoção à mão é respeitada: o ciclo fica sem boleto — e sem
    // pagamento, não compra acesso.
    const { count } = await prisma.subscriptionPayment.updateMany({
      where: {
        asaasPaymentId: payment.id,
        paidAt: null,
        status: { not: CARNE_STATUS.CANCELLED },
      },
      data: { status: CARNE_STATUS.CANCELLED },
    })
    return `assinatura ${subscriptionId}: boleto removido${count ? "" : " (ja cancelado)"}`
  }

  if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_CHARGEBACK_REQUESTED") {
    // Sem carência: ela existe para quem está tentando pagar, não para quem
    // pediu o dinheiro de volta.
    await revokeSubscriptionForRefund(subscriptionId, {
      gateway: "ASAAS",
      externalPaymentId: payment.id,
    })
    return `assinatura ${subscriptionId}: estornada`
  }

  return `assinatura ${subscriptionId}: ${event} — sem acao`
}
