import {
  AsaasApiError,
  cancelSubscription,
  createSubscription,
  deletePayment,
  getPayment,
  listPayments,
  motherAsaasKey,
} from "@/lib/asaas/client"
import type { AsaasCreditCard, AsaasCreditCardHolderInfo } from "@/lib/asaas/types"
import { isChargePayable } from "@/lib/asaas/charge-status"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { recurringMonthlyValue } from "@/lib/resellers/plans"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"

/**
 * Troca a mensalidade da unidade do "mês a mês" (R$ 329, boleto/PIX) para o
 * DÉBITO AUTOMÁTICO no cartão (R$ 289). Disparado pela página /cobranca quando a
 * unidade escolhe cartão à vista.
 *
 * O Asaas não muda `value` de assinatura existente (PUT não aceita), então:
 *   1. cria assinatura NOVA no cartão, R$ 289, vencendo HOJE — o Asaas captura a
 *      1ª cobrança na criação e as seguintes no mesmo cartão, todo mês;
 *   2. aponta a unidade para ela (`asaasSubscriptionId`, `planValue`);
 *   3. remove a cobrança aberta e a assinatura antiga de R$ 329.
 *
 * A ORDEM importa. Cartão recusado em (1) = 4xx e nada muda. (2) vem antes de
 * (3) porque o webhook SUBSCRIPTION_DELETED da antiga suspenderia a unidade se
 * ela ainda apontasse para lá. E o pagamento da assinatura nova pode chegar
 * antes de (2): o processador casa pelo `externalReference` `tenant:<slug>` +
 * cliente (ver process.ts), não só pela assinatura.
 */

export type CardSubscriptionResult =
  | { ok: true; status: string; value: number; pending: boolean }
  | { ok: false; status: number; error: string }

const CAPTURED = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])

export async function convertChargeToCardSubscription(input: {
  paymentId: string
  creditCard: AsaasCreditCard
  creditCardHolderInfo: AsaasCreditCardHolderInfo
  remoteIp: string
}): Promise<CardSubscriptionResult> {
  const payment = await getPayment(input.paymentId)
  if (!isChargePayable(payment)) {
    return { ok: false, status: 400, error: "Cobrança não está pendente de pagamento" }
  }

  // Só a assinatura REGULAR: a promocional já é preço negociado.
  const tenant = payment.subscription
    ? await prisma.tenant.findUnique({
        where: { asaasSubscriptionId: payment.subscription },
        select: {
          id: true,
          name: true,
          slug: true,
          planValue: true,
          asaasCustomerId: true,
          asaasPromoSubscriptionId: true,
        },
      })
    : null
  const value = tenant
    ? recurringMonthlyValue({
        planValue: Number(tenant.planValue),
        hasPromo: Boolean(tenant.asaasPromoSubscriptionId),
      })
    : null
  if (!tenant || value === null) {
    return { ok: false, status: 400, error: "Débito automático indisponível para esta cobrança" }
  }
  const oldSubscriptionId = payment.subscription as string

  // Dois cliques (ou duas abas) criariam DUAS assinaturas e cobrariam o cartão
  // duas vezes. O lock serializa; quem chega depois encontra a unidade já fora
  // da assinatura antiga e para no `updateMany` condicional abaixo.
  let result: CardSubscriptionResult = {
    ok: false,
    status: 409,
    error: "Pagamento já em processamento. Aguarde alguns segundos e recarregue a página.",
  }
  await withAdvisoryLock(advisoryLockKeyFrom(`tenant-card-sub:${tenant.id}`), async () => {
    const still = await prisma.tenant.count({
      where: { id: tenant.id, asaasSubscriptionId: oldSubscriptionId },
    })
    if (still === 0) return

    let subscriptionId: string
    try {
      const sub = await createSubscription(
        {
          customer: tenant.asaasCustomerId ?? payment.customer,
          billingType: "CREDIT_CARD",
          value,
          nextDueDate: dueDateInDays(0),
          cycle: "MONTHLY",
          description: `Mensalidade Profissionaliza Mais Brasil — ${tenant.name} (débito automático)`,
          externalReference: `tenant:${tenant.slug}`,
          creditCard: input.creditCard,
          creditCardHolderInfo: input.creditCardHolderInfo,
          remoteIp: input.remoteIp,
        },
        motherAsaasKey(),
      )
      subscriptionId = sub.id
    } catch (err) {
      if (err instanceof AsaasApiError && err.statusCode >= 400 && err.statusCode < 500) {
        result = {
          ok: false,
          status: 400,
          error: err.errors?.[0]?.description ?? "Cartão recusado.",
        }
        return
      }
      throw err
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { asaasSubscriptionId: subscriptionId, planValue: value },
    })
    await logAudit({
      action: "tenant.billing.card_subscription",
      resource: "Tenant",
      resourceId: tenant.id,
      actorRole: "SYSTEM",
      tenantId: tenant.id,
      payloadBefore: { asaasSubscriptionId: oldSubscriptionId, planValue: Number(tenant.planValue) },
      payloadAfter: { asaasSubscriptionId: subscriptionId, planValue: value, origem: "cobranca" },
    })

    // Cobrança aberta + assinatura antiga. Falhar aqui não desfaz o cartão (o
    // dinheiro já entrou), mas a assinatura antiga seguiria gerando R$ 329 —
    // que venceria e suspenderia uma unidade em dia. Alguém precisa remover.
    await deletePayment(input.paymentId).catch(swallow("tenant.card_sub.delete_old_charge"))
    const oldCancelled = await cancelSubscription(oldSubscriptionId)
      .then(() => true)
      .catch((err) => {
        contextLogger().error(
          { err, event: "tenant.card_sub.cancel_old_failed", tenantId: tenant.id, oldSubscriptionId },
          "falha ao cancelar a assinatura mês a mês após migrar para o cartão",
        )
        return false
      })
    if (!oldCancelled) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: "Assinatura antiga não cancelada",
        body: `Revenda ${tenant.name} passou para o débito automático (${subscriptionId}), mas a assinatura mês a mês ${oldSubscriptionId} não foi cancelada no Asaas. Cancele lá para não cobrar em dobro.`,
        category: "tenant-billing",
        href: `/admin/revendedores/${tenant.id}`,
      }).catch(swallow("tenant.card_sub.notify"))
    }

    // Status real da 1ª cobrança. A ativação da unidade vem pelo webhook (mesmo
    // caminho de qualquer mensalidade); aqui só semeamos a linha para a tela.
    const first = await listPayments({ subscription: subscriptionId, limit: 1 })
      .then((r) => r.data[0] ?? null)
      .catch(() => null)
    if (first) {
      await prisma.tenantPayment
        .create({
          data: {
            tenantId: tenant.id,
            asaasPaymentId: first.id,
            amount: value,
            billingType: "CREDIT_CARD",
            status: "PENDING",
            dueDate: new Date(first.dueDate),
          },
        })
        .catch(() => null) // o webhook pode ter chegado antes
    }

    const status = first?.status ?? "PENDING"
    result = { ok: true, status, value, pending: !CAPTURED.has(status) }
  })
  return result
}
