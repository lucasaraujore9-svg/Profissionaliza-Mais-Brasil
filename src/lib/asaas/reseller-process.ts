import { prisma } from "@/lib/prisma"
import {
  settleSubscriptionCycle,
  markSubscriptionPastDue,
  revokeSubscriptionForRefund,
  recordOpenSubscriptionCharge,
} from "@/lib/subscriptions/renew"
import { getPayment, AsaasApiError } from "./client"
import { fulfillFromAsaasPayment, type AsaasFulfillTenant } from "./fulfillment"
import { settleBoletoInstallment } from "@/lib/installments/settle"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import type { AsaasWebhookPayload } from "./types"

/**
 * Processa webhooks da conta Asaas PRÓPRIA de uma unidade (revendedor
 * recebendo do aluno). É o análogo, no Asaas, do branch de revenda do webhook
 * do MP: resolve a matrícula escopada ao tenant, busca o pagamento autoritativo
 * na conta da unidade (defesa contra body forjado) e efetiva via
 * `fulfillEnrollment` (mesmo core gateway-agnóstico do MP).
 *
 * NÃO é o fluxo da vitrine PMB (processPmbDirectSale) nem o da mensalidade do
 * revendedor (processAsaasWebhook) — aqueles usam a chave global da PMB.
 */
export interface ResellerAsaasTenant extends AsaasFulfillTenant {
  /** API key DESCRIPTOGRAFADA da conta Asaas da unidade. */
  apiKey: string
}

async function markLog(logId: string, success: boolean, error?: string): Promise<void> {
  await prisma.webhookLog
    .update({
      where: { id: logId },
      data: { processed: success, processedAt: new Date(), error: error ?? null },
    })
    .catch(swallow("asaas.reseller.markLog"))
}

export async function processResellerAsaasWebhook(
  logId: string,
  tenant: ResellerAsaasTenant,
  payload: AsaasWebhookPayload,
): Promise<void> {
  try {
    const { event, payment: bodyPayment } = payload

    // Vincula o log ao tenant resolvido (a rota cria o log com tenantId null).
    await prisma.webhookLog
      .update({ where: { id: logId }, data: { tenantId: tenant.id } })
      .catch(swallow("asaas.reseller.process"))

    // Eventos de assinatura sem payment: nada a efetivar aqui (a 1ª/Nª cobrança
    // chega como PAYMENT_*). Apenas registra.
    if (!bodyPayment) {
      await markLog(logId, true, `evento ${event} sem payment — no-op`)
      return
    }

    // Defesa em profundidade: NÃO confia no corpo. Busca o pagamento autoritativo
    // na conta Asaas da unidade. Se não existir lá (404), o id é forjado/alheio.
    let payment
    try {
      payment = await getPayment(bodyPayment.id, tenant.apiKey)
    } catch (err) {
      if (err instanceof AsaasApiError && err.statusCode === 404) {
        await markLog(logId, true, `pagamento ${bodyPayment.id} não existe na conta da unidade — ignorado`)
        return
      }
      throw err
    }

    // ── Parcela de carnê (venda parcelada no boleto) ──────────────────────
    // Cada boleto do carnê é um pagamento próprio; casamos pela linha da parcela
    // (asaasPaymentId), escopada ao tenant. A 1ª paga provisiona o acesso; as
    // demais só registram — via settleBoletoInstallment (idempotente).
    const installment = await prisma.boletoInstallment.findFirst({
      where: { asaasPaymentId: payment.id, tenantId: tenant.id },
    })
    if (installment) {
      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        await settleBoletoInstallment({
          installment,
          tenant: {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            plataformaVendedorId: tenant.plataformaVendedorId,
            isPmbVitrine: false,
          },
          event: {
            gateway: "ASAAS",
            externalPaymentId: payment.id,
            amount: payment.value,
            paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
          },
        })
        await markLog(logId, true, `parcela ${installment.number} paga`)
        return
      }
      // OVERDUE/refund/etc.: o cron cuida do bloqueio por atraso; aqui só registra.
      await markLog(logId, true, `parcela ${installment.number} evento ${event}`)
      return
    }

    // ── Assinatura de aluno DESTA unidade ──────────────────────────────────
    // Roteada ANTES da matrícula: a assinatura não tem matrícula própria (as
    // matrículas nascem sob demanda, uma por curso aberto), então cairia em
    // "matrícula não encontrada" e a renovação nunca aconteceria.
    //
    // Escopada ao tenant, como todo o resto deste processador: uma assinatura de
    // OUTRA unidade nunca pode ser liquidada pelo webhook desta conta.
    if (payment.subscription) {
      const studentSub = await prisma.studentSubscription.findFirst({
        where: { asaasSubscriptionId: payment.subscription, tenantId: tenant.id },
        select: { id: true },
      })
      if (studentSub) {
        if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
          const { settled } = await settleSubscriptionCycle(studentSub.id, {
            gateway: "ASAAS",
            externalPaymentId: payment.id,
            amount: payment.value,
            paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            dueDate: new Date(payment.dueDate),
            billingType: payment.billingType,
            invoiceUrl: payment.invoiceUrl,
            bankSlipUrl: payment.bankSlipUrl,
          })
          await markLog(
            logId,
            true,
            settled
              ? `assinatura ${studentSub.id}: ciclo liquidado`
              : `assinatura ${studentSub.id}: ciclo ja registrado`,
          )
          return
        }
        if (event === "PAYMENT_OVERDUE") {
          await recordOpenSubscriptionCharge(studentSub.id, {
            gateway: "ASAAS",
            externalPaymentId: payment.id,
            amount: payment.value,
            dueDate: new Date(payment.dueDate),
            billingType: payment.billingType,
            invoiceUrl: payment.invoiceUrl,
            bankSlipUrl: payment.bankSlipUrl,
            status: "OVERDUE",
          })
          await markSubscriptionPastDue(studentSub.id)
          await markLog(logId, true, `assinatura ${studentSub.id}: em atraso`)
          return
        }
        if (event === "PAYMENT_CREATED" || event === "PAYMENT_UPDATED") {
          await recordOpenSubscriptionCharge(studentSub.id, {
            gateway: "ASAAS",
            externalPaymentId: payment.id,
            amount: payment.value,
            dueDate: new Date(payment.dueDate),
            billingType: payment.billingType,
            invoiceUrl: payment.invoiceUrl,
            bankSlipUrl: payment.bankSlipUrl,
            status: "PENDING",
          })
          await markLog(logId, true, `assinatura ${studentSub.id}: cobranca em aberto registrada`)
          return
        }
        if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_CHARGEBACK_REQUESTED") {
          await revokeSubscriptionForRefund(studentSub.id)
          await markLog(logId, true, `assinatura ${studentSub.id}: estornada`)
          return
        }
        await markLog(logId, true, `assinatura ${studentSub.id}: ${event} — sem acao`)
        return
      }
    }

    // Resolve a matrícula SEMPRE escopada ao tenant (anti cross-tenant):
    // externalReference (enr_<id>), depois asaasPaymentId, depois subscription.
    let enrollment = null as Awaited<ReturnType<typeof prisma.enrollment.findFirst>>
    if (payment.externalReference?.startsWith("enr_")) {
      const enrollmentId = payment.externalReference.replace("enr_", "")
      enrollment = await prisma.enrollment.findFirst({
        where: { id: enrollmentId, tenantId: tenant.id },
      })
    }
    if (!enrollment) {
      enrollment = await prisma.enrollment.findFirst({
        where: { asaasPaymentId: payment.id, tenantId: tenant.id },
      })
    }
    if (!enrollment && payment.subscription) {
      enrollment = await prisma.enrollment.findFirst({
        where: { asaasSubscriptionId: payment.subscription, tenantId: tenant.id },
      })
    }

    if (!enrollment) {
      // Não lança: evita retry infinito do Asaas por um id que nunca casa.
      await markLog(logId, true, `matrícula não encontrada para ${payment.id} (tenant ${tenant.slug})`)
      return
    }

    switch (event) {
      case "PAYMENT_RECEIVED":
      case "PAYMENT_CONFIRMED": {
        await fulfillFromAsaasPayment(
          tenant,
          enrollment.id,
          payment,
          enrollment.paymentType,
        )
        await markLog(
          logId,
          true,
          enrollment.installmentsTotal
            ? `mensalidade revenda processada (${enrollment.installmentsPaid + 1}/${enrollment.installmentsTotal})`
            : "venda revenda Asaas processada",
        )
        return
      }

      case "PAYMENT_OVERDUE": {
        // Boleto/PIX vencido sem pagamento: marca a matrícula PENDING como
        // suspensa para não ficar pendente eternamente (igual à vitrine PMB).
        if (enrollment.status === "PENDING") {
          await prisma.enrollment
            .update({ where: { id: enrollment.id }, data: { status: "SUSPENDED" } })
            .catch(swallow("asaas.reseller.process"))
        }
        await markLog(logId, true, `overdue: ${payment.id}`)
        return
      }

      case "PAYMENT_REFUNDED":
      case "PAYMENT_DELETED":
      case "PAYMENT_CHARGEBACK_REQUESTED": {
        // Estorno/chargeback de venda da unidade. Não revogamos acesso do aluno
        // automaticamente (decisão comercial da unidade) — notificamos para
        // tratamento manual, como o MP faz nesses casos.
        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "WARNING",
          title: `Estorno/chargeback em uma venda — ${enrollment.id}`,
          body: `O pagamento ${payment.id} (R$ ${payment.value.toFixed(2).replace(".", ",")}) recebeu ${event}. Avalie se deve manter o acesso do aluno.`,
          category: "payment",
          href: "/painel/financeiro",
        }).catch(swallow("asaas.reseller.process"))
        await markLog(logId, true, `${event}: ${payment.id} — notificado`)
        return
      }

      default:
        await markLog(logId, true, `${event} — sem ação`)
        return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    contextLogger().error(
      { err: error, event: "asaas.reseller.process.failed", webhookLogId: logId },
      "webhook Asaas (revenda) processing failed",
    )
    await markLog(logId, false, message)
    // Relança para a rota responder 500 → Asaas reentrega (idempotente via
    // asaasPaymentId no fulfill).
    throw error
  }
}
