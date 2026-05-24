import { prisma } from "@/lib/prisma"
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
import type { AsaasWebhookPayload } from "./types"
import { swallow } from "@/lib/errors"

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
    where: { asaasSubscriptionId: subscriptionId },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      status: true,
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
      console.error(`[asaas] block errors for ${tenant.id}:`, blockResult.errors)
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

    const { payment } = payload
    if (!payment) {
      await markLog(logId, true, `evento ${event} sem payment`)
      return
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

    const tenant = await prisma.tenant.findFirst({
      where: { asaasSubscriptionId: subscriptionId },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        billingMode: true,
        status: true,
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
          data: { status: "ACTIVE" },
        })

        await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

        if (wasSuspended) {
          const result = await unblockTenantStudents(tenant.id)
          if (result.errors.length > 0) {
            console.error(`[asaas] unblock errors for ${tenant.id}:`, result.errors)
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
                description: "Mensalidade Profissionaliza Mais Brasil",
                receiptUrl: payment.transactionReceiptUrl ?? undefined,
              },
            },
          }).catch((err) => {
            console.error("[asaas] failed to send payment email:", err)
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
            console.error(
              "[asaas] createCommissionForTenantPayment falhou:",
              err,
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
            console.error(`[asaas] block errors for ${tenant.id}:`, result.errors)
          }
        }

        if (tenant.owner?.email) {
          const subject =
            tenant.billingMode === "AUTO"
              ? "Sua assinatura esta vencida — alunos bloqueados"
              : "Sua assinatura esta vencida"
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
                    ? "Mensalidade vencida. Seus alunos foram bloqueados ate o pagamento."
                    : "Mensalidade vencida. Regularize para evitar bloqueios.",
                receiptUrl: payment.invoiceUrl ?? undefined,
              },
            },
          }).catch((err) => {
            console.error("[asaas] failed to send overdue email:", err)
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
        // Atualiza status da cobrança no banco
        await prisma.tenantPayment
          .updateMany({
            where: { asaasPaymentId: payment.id, tenantId: tenant.id },
            data: { status: payment.status },
          })
          .catch(swallow("asaas.process"))

        // Cancela comissao de indicacao (se houver)
        await cancelCommissionForTenantPayment(
          tenantPaymentRow.id,
          event === "PAYMENT_REFUNDED" ? "refund" : "partial_refund",
        ).catch((err) => {
          console.error(
            "[asaas] cancelCommissionForTenantPayment falhou:",
            err,
          )
        })

        // Verifica se ainda há algum pagamento RECEIVED/CONFIRMED para este tenant.
        // Se não houver, suspende a conta (dinheiro foi devolvido = não pagou).
        const otherConfirmed = await prisma.tenantPayment.findFirst({
          where: {
            tenantId: tenant.id,
            asaasPaymentId: { not: payment.id },
            status: { in: ["RECEIVED", "CONFIRMED"] },
          },
          select: { id: true },
        })

        if (!otherConfirmed && tenant.status === "ACTIVE") {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { status: "SUSPENDED" },
          })
          await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

          if (tenant.billingMode === "AUTO") {
            const result = await blockTenantStudents(tenant.id)
            if (result.errors.length > 0) {
              console.error(`[asaas] block errors after refund for ${tenant.id}:`, result.errors)
            }
          }
        }

        // Notifica admin sobre o estorno
        await createNotification({
          audience: "ROLE",
          roleTarget: "SUPER_ADMIN",
          level: "WARNING",
          title: `Estorno detectado: ${tenant.name}`,
          body: `Pagamento de ${formatMoney(payment.value)} foi ${event === "PAYMENT_REFUNDED" ? "estornado" : "parcialmente estornado"}.${!otherConfirmed ? " Conta suspensa automaticamente." : ""}`,
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
            subject: "Estorno detectado na sua assinatura",
            template: {
              type: "payment",
              props: {
                customerName: tenant.owner.name ?? tenant.name,
                amount: formatMoney(payment.value),
                paymentDate: formatDate(payment.paymentDate),
                description: !otherConfirmed
                  ? "O pagamento foi estornado e sua conta foi suspensa. Faça um novo pagamento para reativar."
                  : "Um pagamento foi estornado. Sua conta permanece ativa pois há outros pagamentos confirmados.",
                receiptUrl: payment.invoiceUrl ?? undefined,
              },
            },
          }).catch((err) => {
            console.error("[asaas] failed to send refund email:", err)
          })
        }
        break
      }

      case "PAYMENT_DELETED": {
        await prisma.tenantPayment
          .updateMany({
            where: { asaasPaymentId: payment.id, tenantId: tenant.id },
            data: { status: "DELETED" },
          })
          .catch(swallow("asaas.process"))
        break
      }

      case "PAYMENT_CREATED":
      case "PAYMENT_UPDATED":
      default:
        break
    }

    await markLog(logId, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    console.error(`[asaas] webhook processing failed (${logId}):`, error)
    await markLog(logId, false, message)
  }
}
