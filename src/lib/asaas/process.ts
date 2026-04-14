import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { blockTenantStudents, unblockTenantStudents } from "@/lib/auto-block"
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

export async function processAsaasWebhook(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  try {
    const { event, payment } = payload

    const subscriptionId = payment.subscription
    if (!subscriptionId) {
      await markLog(logId, true, `sem subscription: ${event}`)
      return
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
