import type { AsaasWebhookPayload } from "./types"

/**
 * Valida o token do webhook do Asaas.
 *
 * Em produção, exige `ASAAS_WEBHOOK_TOKEN` configurado e que bata com o header
 * `asaas-access-token`. Em desenvolvimento, aceita quando o token não está
 * configurado (facilita testes locais com ngrok/forwarding).
 */
export function validateAsaasWebhook(
  headerToken: string | null,
): boolean {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expectedToken) {
    if (process.env.NODE_ENV === "production") {
      // Em produção, exigir o token. Aceitar webhook anônimo permitiria
      // que qualquer um marcasse enrollments como pagos.
      console.error(
        "[asaas-webhook] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando.",
      )
      return false
    }
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
