import { prisma } from "@/lib/prisma"
import { getPayment as getAsaasPayment, AsaasApiError } from "./client"
import { isTransientWebhookError } from "@/lib/webhooks/transient"
import { sendEmail } from "@/lib/email/resend"
import { blockTenantStudents, unblockTenantStudents } from "@/lib/auto-block"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { createNotification } from "@/lib/notifications"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import {
  createCommissionForTenantPayment,
  cancelCommissionForTenantPayment,
} from "@/lib/referrals/commission"
import { flagMonthlyCommissionForRefund } from "@/lib/referrals/monthly"
import type { AsaasWebhookPayload } from "./types"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}

/**
 * Suspende o tenant cuja Asaas subscription foi inativada/cancelada. Sem isso
 * o sweep so detectaria ~3 dias apos a proxima cobranca vencer.
 */
async function handleSubscriptionCancellation(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  const { event, subscription } = payload
  const subscriptionId = subscription?.id
  if (!subscriptionId) {
    await markLog(logId, true, `${event} sem subscription.id`)
    return
  }

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { asaasSubscriptionId: subscriptionId },
        { asaasPromoSubscriptionId: subscriptionId },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      status: true,
      asaasSubscriptionId: true,
      asaasPromoSubscriptionId: true,
      owner: { select: { email: true, name: true } },
    },
  })

  if (!tenant) {
    await markLog(logId, true, `tenant nao encontrado para ${subscriptionId}`)
    return
  }

  await prisma.webhookLog
    .update({ where: { id: logId }, data: { tenantId: tenant.id } })
    .catch(swallow("asaas.process"))

  // Encerramento NATURAL da promo: ao atingir maxPayments, o Asaas inativa a
  // subscription promocional. Isso NAO pode suspender o tenant — a assinatura
  // regular (valor cheio) assume a partir do mes N. So suspendemos quando a
  // assinatura REGULAR e cancelada.
  if (
    subscriptionId === tenant.asaasPromoSubscriptionId &&
    subscriptionId !== tenant.asaasSubscriptionId
  ) {
    await markLog(logId, true, `${event}: promo encerrada (maxPayments) — sem suspensao`)
    return
  }

  if (tenant.status !== "SUSPENDED" && tenant.status !== "CANCELLED") {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "SUSPENDED" },
    })

    // Aguarda invalidação de cache antes de seguir — evita race onde requests
    // simultâneos leem status cached ACTIVE enquanto DB já mudou para SUSPENDED.
    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    }).catch(swallow("asaas.process"))

    const blockResult = await blockTenantStudents(tenant.id)
    if (blockResult.errors.length > 0) {
      contextLogger().error(
        { event: "asaas.subscription.block_errors", tenantId: tenant.id, errors: blockResult.errors },
        "erros ao bloquear alunos após cancelamento de assinatura",
      )
    }

    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: `Revendedor ${tenant.name} teve assinatura cancelada`,
      body: `Assinatura Asaas ${subscriptionId} foi ${event === "SUBSCRIPTION_DELETED" ? "removida" : "inativada"}. Tenant suspenso automaticamente.`,
      category: "tenant-billing",
      href: `/admin/revendedores/${tenant.id}`,
    })
  }

  await markLog(logId, true, `${event} processado`)
}

/**
 * Confirma o cancelamento de uma cobrança (mensalidade) via webhook
 * PAYMENT_DELETED. Valida que a cobrança REALMENTE sumiu do Asaas (404) antes
 * de marcar DELETED — um evento que ainda resolve 200 é espúrio e é ignorado.
 * Fecha o ciclo iniciado pelo botão "Cancelar" do painel (que deixa a linha
 * em DELETING). asaasPaymentId é único, então o updateMany casa no máximo 1.
 */
async function handlePaymentDeleted(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  const paymentId = payload.payment?.id
  if (!paymentId) {
    await markLog(logId, true, "PAYMENT_DELETED sem payment.id")
    return
  }

  // Validação: cobrança deletada responde 404. Se ainda existir (200), o
  // evento não corresponde a um cancelamento efetivo → ignora.
  try {
    await getAsaasPayment(paymentId)
    await markLog(logId, true, `PAYMENT_DELETED mas ${paymentId} ainda existe no Asaas — ignorado`)
    return
  } catch (err) {
    if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
    // 404 confirmado → segue para marcar DELETED.
  }

  const existing = await prisma.tenantPayment.findUnique({
    where: { asaasPaymentId: paymentId },
    select: { id: true, tenantId: true },
  })
  if (!existing) {
    await markLog(logId, true, `PAYMENT_DELETED: ${paymentId} sem TenantPayment correspondente`)
    return
  }

  await prisma.tenantPayment.update({
    where: { asaasPaymentId: paymentId },
    data: { status: "DELETED" },
  })

  await prisma.webhookLog
    .update({ where: { id: logId }, data: { tenantId: existing.tenantId } })
    .catch(swallow("asaas.process"))

  await markLog(logId, true, `PAYMENT_DELETED confirmado para ${paymentId}`)
}

async function markLog(
  logId: string,
  success: boolean,
  error?: string,
): Promise<void> {
  await prisma.webhookLog
    .update({
      where: { id: logId },
      data: {
        processed: success,
        processedAt: new Date(),
        error: error ?? null,
      },
    })
    .catch(swallow("asaas.process"))
}

async function processPmbDirectSale(
  logId: string,
  event: string,
  payment: NonNullable<AsaasWebhookPayload["payment"]>,
): Promise<boolean> {
  // Detecta venda direta PMB por:
  // 1. externalReference (pmb_enr_<id>) — propagado para todas as cobrancas da subscription
  // 2. asaas_payment_id (legado, cobrancas one-time)
  // 3. asaas_subscription_id (parcelas seguintes da subscription, caso externalReference falhe)
  let enrollment = null as Awaited<
    ReturnType<typeof prisma.enrollment.findFirst>
  >

  if (payment.externalReference?.startsWith("pmb_enr_")) {
    const enrollmentId = payment.externalReference.replace("pmb_enr_", "")
    enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    })
  }

  if (!enrollment) {
    enrollment = await prisma.enrollment.findFirst({
      where: { asaasPaymentId: payment.id },
    })
  }

  if (!enrollment && payment.subscription) {
    enrollment = await prisma.enrollment.findFirst({
      where: { asaasSubscriptionId: payment.subscription },
    })
  }

  if (!enrollment || enrollment.tenantId !== null) return false

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    await fulfillEnrollment(
      {
        id: "__pmb__",
        slug: pmbPlataformaPolo(),
        plataformaVendedorId: pmbPlataformaVendedorId(),
        isPmbVitrine: true,
      },
      enrollment.id,
      {
        gateway: "ASAAS",
        externalPaymentId: payment.id,
        amount: payment.value,
        paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
        paymentType: enrollment.paymentType,
      },
    )
    await markLog(
      logId,
      true,
      enrollment.installmentsTotal
        ? `pmb mensalidade processada (${enrollment.installmentsPaid + 1}/${enrollment.installmentsTotal})`
        : "pmb venda direta processada",
    )
    return true
  }

  if (event === "PAYMENT_OVERDUE") {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "SUSPENDED" },
    }).catch(swallow("asaas.process"))
  }

  await markLog(logId, true, `pmb venda direta: ${event} sem fulfillment`)
  return true
}

export async function processAsaasWebhook(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  try {
    const { event } = payload

    // Eventos de assinatura (cancelamento/inativacao) chegam com `subscription`
    // em vez de `payment`. Tratamos primeiro para suspender o tenant antes
    // de qualquer logica que dependa de `payment`.
    if (
      event === "SUBSCRIPTION_INACTIVATED" ||
      event === "SUBSCRIPTION_DELETED"
    ) {
      await handleSubscriptionCancellation(logId, payload)
      return
    }

    if (event === "SUBSCRIPTION_CREATED" || event === "SUBSCRIPTION_UPDATED") {
      await markLog(logId, true, `assinatura ${event.toLowerCase()} — no-op`)
      return
    }

    // Confirmação de cancelamento de cobrança. Tratado ANTES do re-fetch geral:
    // uma cobrança deletada responde 404, então o getAsaasPayment abaixo
    // abortaria com "não existe → ignorado" e nunca marcaria o banco. Aqui o
    // 404 é justamente a PROVA de que a cobrança sumiu (DELETING → DELETED).
    if (event === "PAYMENT_DELETED") {
      await handlePaymentDeleted(logId, payload)
      return
    }

    let payment = payload.payment
    if (!payment) {
      await markLog(logId, true, `evento ${event} sem payment`)
      return
    }

    // Defesa em profundidade (espelha reseller-process.ts e o webhook MP): NÃO
    // confiar no corpo do webhook. Re-busca o pagamento autoritativo na conta
    // Asaas GLOBAL da PMB (sem apiKeyOverride). Se o id não existir lá (404), o
    // corpo é forjado/alheio → ignora. Reatribui `payment` para que TODO o
    // processamento abaixo (upsert de TenantPayment, ativação, comissão, venda
    // direta PMB) reflita value/status/dueDate REAIS, não o que veio no corpo.
    // Antes, a única barreira era o token estático global — insuficiente se ele
    // vazasse (ativação/comissão forjadas sem pagamento real).
    try {
      payment = await getAsaasPayment(payment.id)
    } catch (err) {
      if (err instanceof AsaasApiError && err.statusCode === 404) {
        await markLog(logId, true, `pagamento ${payment.id} não existe na conta global PMB — ignorado`)
        return
      }
      throw err
    }

    const subscriptionId = payment.subscription
    if (!subscriptionId) {
      const handled = await processPmbDirectSale(logId, event, payment)
      if (handled) return
      await markLog(logId, true, `sem subscription: ${event}`)
      return
    }

    // Se a subscription pertence a uma matricula PMB (vitrine principal),
    // delega para o processamento de venda direta antes de tentar tenant.
    const pmbEnrollmentForSubscription = await prisma.enrollment.findFirst({
      where: { asaasSubscriptionId: subscriptionId, tenantId: null },
      select: { id: true },
    })
    if (pmbEnrollmentForSubscription) {
      const handled = await processPmbDirectSale(logId, event, payment)
      if (handled) return
    }

    // Casa tanto a assinatura regular quanto a promocional (mensalidade
    // promocional usa duas subscriptions; ambas cobram o mesmo tenant).
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { asaasSubscriptionId: subscriptionId },
          { asaasPromoSubscriptionId: subscriptionId },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        billingMode: true,
        status: true,
        activatedAt: true,
        owner: { select: { email: true, name: true } },
      },
    })

    if (!tenant) {
      await markLog(logId, true, `tenant nao encontrado para ${subscriptionId}`)
      return
    }

    await prisma.webhookLog.update({
      where: { id: logId },
      data: { tenantId: tenant.id },
    }).catch(swallow("asaas.process"))

    const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : null

    const tenantPaymentRow = await prisma.tenantPayment.upsert({
      where: { asaasPaymentId: payment.id },
      update: {
        status: payment.status,
        paidAt,
        ...(payment.invoiceUrl ? { invoiceUrl: payment.invoiceUrl } : {}),
        ...(payment.bankSlipUrl ? { bankSlipUrl: payment.bankSlipUrl } : {}),
      },
      create: {
        tenantId: tenant.id,
        asaasPaymentId: payment.id,
        amount: payment.value,
        billingType: payment.billingType,
        status: payment.status,
        dueDate: new Date(payment.dueDate),
        paidAt,
        invoiceUrl: payment.invoiceUrl ?? null,
        bankSlipUrl: payment.bankSlipUrl ?? null,
      },
      select: { id: true },
    })

    switch (event) {
      case "PAYMENT_RECEIVED":
      case "PAYMENT_CONFIRMED": {
        const wasSuspended = tenant.status === "SUSPENDED"

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            status: "ACTIVE",
            // Marca a 1a ativacao (base p/ escalonamento de comissao). So na
            // primeira vez — reativacoes pos-suspensao nao reiniciam a escala.
            ...(tenant.activatedAt ? {} : { activatedAt: paidAt ?? new Date() }),
          },
        })

        await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

        if (wasSuspended) {
          const result = await unblockTenantStudents(tenant.id)
          if (result.errors.length > 0) {
            contextLogger().error(
              { event: "asaas.payment.unblock_errors", tenantId: tenant.id, errors: result.errors },
              "erros ao desbloquear alunos após pagamento",
            )
          }
        }

        if (tenant.owner?.email) {
          await sendEmail({
            to: tenant.owner.email,
            subject: "Pagamento da mensalidade confirmado",
            template: {
              type: "payment",
              props: {
                customerName: tenant.owner.name ?? tenant.name,
                amount: formatMoney(payment.value),
                paymentDate: formatDate(payment.paymentDate),
                description:
                  "Recebemos sua mensalidade do Profissionaliza Mais Brasil — obrigado! Sua vitrine segue ativa.",
                receiptUrl: payment.transactionReceiptUrl ?? undefined,
                variant: "confirmed",
              },
            },
          }).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.payment.email_failed", tenantId: tenant.id },
              "falha ao enviar email de confirmação de pagamento",
            )
          })
        }

        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "SUCCESS",
          title: wasSuspended
            ? "Conta reativada após pagamento"
            : "Mensalidade paga",
          body: `Pagamento de ${formatMoney(payment.value)} confirmado.`,
          category: "tenant-billing",
          href: "/painel/financeiro",
        })

        // Cria comissao de indicacao (1-nivel) se o tenant possui referrer
        await createCommissionForTenantPayment(tenantPaymentRow.id).catch(
          (err) => {
            contextLogger().error(
              { err, event: "asaas.payment.commission_failed", tenantPaymentId: tenantPaymentRow.id },
              "createCommissionForTenantPayment falhou",
            )
          },
        )
        break
      }

      case "PAYMENT_OVERDUE": {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { status: "SUSPENDED" },
        })

        await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

        if (tenant.billingMode === "AUTO") {
          const result = await blockTenantStudents(tenant.id)
          if (result.errors.length > 0) {
            contextLogger().error(
              { event: "asaas.overdue.block_errors", tenantId: tenant.id, errors: result.errors },
              "erros ao bloquear alunos após overdue",
            )
          }
        }

        if (tenant.owner?.email) {
          const subject =
            tenant.billingMode === "AUTO"
              ? "Sua mensalidade venceu — alunos bloqueados"
              : "Sua mensalidade venceu"
          await sendEmail({
            to: tenant.owner.email,
            subject,
            template: {
              type: "payment",
              props: {
                customerName: tenant.owner.name ?? tenant.name,
                amount: formatMoney(payment.value),
                paymentDate: formatDate(payment.dueDate),
                description:
                  tenant.billingMode === "AUTO"
                    ? "Sua mensalidade venceu. Para evitar perda de receita, seus alunos foram bloqueados temporariamente até a regularização."
                    : "Sua mensalidade venceu. Regularize agora para manter a vitrine ativa e evitar o bloqueio dos seus alunos.",
                receiptUrl: payment.invoiceUrl ?? undefined,
                variant: "overdue",
              },
            },
          }).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.overdue.email_failed", tenantId: tenant.id },
              "falha ao enviar email de overdue",
            )
          })
        }

        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "ERROR",
          title: "Mensalidade em atraso — conta suspensa",
          body:
            tenant.billingMode === "AUTO"
              ? `Vencimento ${formatDate(payment.dueDate)}. Seus alunos foram bloqueados.`
              : `Vencimento ${formatDate(payment.dueDate)}. Regularize para evitar bloqueio dos alunos.`,
          category: "tenant-billing",
          href: payment.invoiceUrl ?? "/painel/financeiro",
        })

        await createNotification({
          audience: "ROLE",
          roleTarget: "SUPER_ADMIN",
          level: "WARNING",
          title: `Revendedor ${tenant.name} inadimplente`,
          body: `Cobrança ${formatMoney(payment.value)} venceu em ${formatDate(payment.dueDate)}.`,
          category: "tenant-billing",
          href: `/admin/revendedores/${tenant.id}`,
        })
        break
      }

      case "PAYMENT_REFUNDED":
      case "PAYMENT_PARTIALLY_REFUNDED": {
        const isPartial = event === "PAYMENT_PARTIALLY_REFUNDED"

        // Atualiza status da cobrança no banco
        await prisma.tenantPayment
          .updateMany({
            where: { asaasPaymentId: payment.id, tenantId: tenant.id },
            data: { status: payment.status },
          })
          .catch(swallow("asaas.process"))

        // Cancela comissao de indicacao (se houver). Para refund TOTAL,
        // a comissão é cancelada inteira. Para refund PARCIAL, só
        // anulamos se o refund cobre a comissão integral; caso contrário
        // a deixamos para revisão manual (admin avalia se é proporcional).
        // Antes, refund parcial CANCELAVA toda a comissão — desproporcional
        // pra refund de R$10 em fatura de R$200.
        if (!isPartial) {
          await cancelCommissionForTenantPayment(
            tenantPaymentRow.id,
            "refund",
          ).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.refund.cancel_commission_failed", tenantPaymentId: tenantPaymentRow.id },
              "cancelCommissionForTenantPayment falhou",
            )
          })
          // Motor por faixas (MONTHLY_TIERED): a comissão mensal não está
          // atrelada a um tenantPaymentId, então tratamos o clawback à parte.
          await flagMonthlyCommissionForRefund(
            tenantPaymentRow.id,
            "refund",
          ).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.refund.flag_monthly_failed", tenantPaymentId: tenantPaymentRow.id },
              "flagMonthlyCommissionForRefund falhou",
            )
          })
        } else {
          // Refund parcial: notifica admin para tratar manualmente. Não
          // cancela automaticamente (evita over-clawback em refund pequeno).
          await createNotification({
            audience: "ROLE",
            roleTarget: "SUPER_ADMIN",
            level: "WARNING",
            title: `Refund parcial em ${tenant.name}`,
            body: `Pagamento ${payment.id} estornado parcialmente. Comissão de indicação NÃO foi ajustada automaticamente — revise manualmente em /admin/indicacoes/comissoes.`,
            category: "referral",
            href: `/admin/indicacoes/comissoes`,
          }).catch(() => {})
        }

        // Verifica se ainda há algum pagamento RECEIVED/CONFIRMED para este tenant.
        // Se não houver, suspende a conta (dinheiro foi devolvido = não pagou).
        // Para refund PARCIAL, NÃO suspende — tenant ainda pagou parte.
        const otherConfirmed = await prisma.tenantPayment.findFirst({
          where: {
            tenantId: tenant.id,
            asaasPaymentId: { not: payment.id },
            status: { in: ["RECEIVED", "CONFIRMED"] },
          },
          select: { id: true },
        })

        if (!isPartial && !otherConfirmed && tenant.status === "ACTIVE") {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { status: "SUSPENDED" },
          })
          await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

          if (tenant.billingMode === "AUTO") {
            const result = await blockTenantStudents(tenant.id)
            if (result.errors.length > 0) {
              contextLogger().error(
                { event: "asaas.refund.block_errors", tenantId: tenant.id, errors: result.errors },
                "erros ao bloquear alunos após refund",
              )
            }
          }
        }

        // Notifica admin sobre o estorno
        await createNotification({
          audience: "ROLE",
          roleTarget: "SUPER_ADMIN",
          level: "WARNING",
          title: `Estorno detectado: ${tenant.name}`,
          body: `Pagamento de ${formatMoney(payment.value)} foi ${isPartial ? "parcialmente estornado" : "estornado"}.${!isPartial && !otherConfirmed ? " Conta suspensa automaticamente." : ""}`,
          category: "tenant-billing",
          href: `/admin/revendedores/${tenant.id}`,
        })

        // Notifica o dono do tenant
        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "ERROR",
          title: "Pagamento estornado",
          body: `O pagamento de ${formatMoney(payment.value)} foi estornado.${!otherConfirmed ? " Sua conta foi suspensa. Regularize para reativar." : ""}`,
          category: "tenant-billing",
          href: "/painel/financeiro",
        })

        if (tenant.owner?.email) {
          await sendEmail({
            to: tenant.owner.email,
            subject: "Pagamento estornado",
            template: {
              type: "payment",
              props: {
                customerName: tenant.owner.name ?? tenant.name,
                amount: formatMoney(payment.value),
                paymentDate: formatDate(payment.paymentDate),
                description: !otherConfirmed
                  ? "Identificamos o estorno deste pagamento e sua conta foi suspensa. Para reativar a vitrine, faça uma nova cobrança."
                  : "Identificamos um estorno. Sua conta permanece ativa porque há outros pagamentos confirmados no período.",
                receiptUrl: payment.invoiceUrl ?? undefined,
                variant: "refunded",
              },
            },
          }).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.refund.email_failed", tenantId: tenant.id },
              "falha ao enviar email de estorno",
            )
          })
        }
        break
      }

      // PAYMENT_DELETED é tratado cedo em handlePaymentDeleted (a cobrança
      // deletada responde 404 e nunca chega aqui após o re-fetch).

      case "PAYMENT_CREATED":
      case "PAYMENT_UPDATED":
      default:
        break
    }

    await markLog(logId, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    contextLogger().error(
      { err: error, event: "asaas.process.failed", webhookLogId: logId },
      "webhook Asaas processing failed",
    )
    await markLog(logId, false, message)
    // Erros transitórios (Asaas 5xx/rede, deadlock/timeout de DB) são RELANÇADOS
    // para a rota responder 500 e o Asaas REENTREGAR — o processamento é
    // idempotente (asaasPaymentId no upsert + advisory lock no fulfill). Mesma
    // política do webhook MP e do branch de revenda (que relança tudo).
    if (isTransientWebhookError(error)) throw error
  }
}
