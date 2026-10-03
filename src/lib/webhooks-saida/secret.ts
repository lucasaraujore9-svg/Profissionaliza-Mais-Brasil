import { createHmac, randomBytes } from "node:crypto"

/** Segredo do HMAC mostrado ao admin. Prefixo só para identificar na hora de colar. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`
}

/**
 * Assinatura = HMAC-SHA256(segredo, `${timestamp}.${corpo}`) em hex — o MESMO
 * esquema do webhook de entrada do LMS, para o integrador ter um jeito só de
 * conferir. O timestamp entra na assinatura para o receptor recusar replay.
 */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}
