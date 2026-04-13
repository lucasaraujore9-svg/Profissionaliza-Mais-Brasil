import type { MPWebhookNotification } from "./types"

/**
 * Parse do payload IPN (Instant Payment Notification) do MP.
 */
export function parseMpNotification(body: unknown): MPWebhookNotification {
  return (body ?? {}) as MPWebhookNotification
}

/**
 * Indica se a notificação é de pagamento (vs assinatura, merchant order, etc).
 */
export function isPaymentNotification(
  notification: MPWebhookNotification,
): boolean {
  return notification.type === "payment"
}

export function isPreapprovalNotification(
  notification: MPWebhookNotification,
): boolean {
  return notification.type === "subscription_preapproval" || notification.type === "preapproval"
}
