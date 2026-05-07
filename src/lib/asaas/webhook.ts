import type { AsaasWebhookPayload } from "./types"

/**
 * Valida o token do webhook do Asaas.
 * O Asaas envia o token no header `asaas-access-token`.
 */
export function validateAsaasWebhook(
  headerToken: string | null,
): boolean {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expectedToken) {
    // Token não configurado — aceita o webhook. Configure ASAAS_WEBHOOK_TOKEN para validação.
    return true
  }
  return headerToken === expectedToken
}

/**
 * Parse e valida o payload do webhook.
 */
export function parseAsaasWebhookPayload(
  body: unknown,
): AsaasWebhookPayload {
  const payload = body as AsaasWebhookPayload
  if (!payload?.event || !payload?.payment) {
    throw new Error("Invalid Asaas webhook payload")
  }
  return payload
}
