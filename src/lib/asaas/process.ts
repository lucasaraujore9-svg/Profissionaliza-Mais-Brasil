import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { blockTenantStudents, unblockTenantStudents } from "@/lib/auto-block"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { pmbEaPolo, pmbEaVendedorId } from "@/lib/pmb-config"
import type { AsaasWebhookPayload } from "./types"

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
    .catch(() => undefined)
}

async function processPmbDirectSale(
  logId: string,
  event: string,
  payment: AsaasWebhookPayload["payment"],
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
        slug: pmbEaPolo(),
        eaVendedorId: pmbEaVendedorId(),
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
    }).catch(() => undefined)
  }

  await markLog(logId, true, `pmb venda direta: ${event} sem fulfillment`)
  return true
}

export async function processAsaasWebhook(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  try {
    const { event, payment } = payload

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
    }).catch(() => undefined)

    const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : null

    await prisma.tenantPayment.upsert({
      where: { asaasPaymentId: payment.id },
      update: {
        status: payment.status,
        paidAt,
      },
      create: {
        tenantId: tenant.id,
        asaasPaymentId: payment.id,
        amount: payment.value,
        billingType: payment.billingType,
        status: payment.status,
        dueDate: new Date(payment.dueDate),
        paidAt,
      },
    })

    switch (event) {
      case "PAYMENT_RECEIVED":
      case "PAYMENT_CONFIRMED": {
        const wasSuspended = tenant.status === "SUSPENDED"

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { status: "ACTIVE" },
        })

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
        break
      }

      case "PAYMENT_OVERDUE": {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { status: "SUSPENDED" },
        })

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
        break
      }

      case "PAYMENT_REFUNDED":
      case "PAYMENT_DELETED": {
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
