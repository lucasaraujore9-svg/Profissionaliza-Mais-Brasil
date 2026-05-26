import { timingSafeEqual } from "node:crypto"
import type { AsaasWebhookPayload } from "./types"
import { contextLogger } from "@/lib/logger"

/**
 * Valida o token do webhook do Asaas em tempo constante.
 *
 * Exige `ASAAS_WEBHOOK_TOKEN` configurado em qualquer ambiente — rejeita se
 * ausente. Em dev local, defina a env com qualquer string e configure no
 * painel do Asaas (ou no script de teste) o mesmo valor.
 *
 * Antes existia um "dev bypass" (retornava true quando a env não estava
 * setada). Isso era perigoso: uma config errada em staging desativava
 * silenciosamente toda a autenticação de webhooks de cobrança.
 */
export function validateAsaasWebhook(
  headerToken: string | null,
): boolean {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expectedToken) {
    contextLogger().error(
      { event: "asaas.webhook.missing_token_env" },
      "ASAAS_WEBHOOK_TOKEN ausente — rejeitando. Defina a env mesmo em dev.",
    )
    return false
  }
  if (!headerToken) return false
  const a = Buffer.from(headerToken)
  const b = Buffer.from(expectedToken)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Parse e valida o payload do webhook.
 *
 * `event` é sempre obrigatório. `payment` aparece em PAYMENT_* events,
 * `subscription` em SUBSCRIPTION_* events — exigimos pelo menos um. Antes
 * exigíamos `payment` em todos, o que rejeitava SUBSCRIPTION_INACTIVATED/
 * DELETED com 400 e impedia a suspensão automática do tenant via webhook.
 */
export function parseAsaasWebhookPayload(
  body: unknown,
): AsaasWebhookPayload {
  const payload = body as AsaasWebhookPayload
  if (!payload?.event) {
    throw new Error("Invalid Asaas webhook payload: missing event")
  }
  if (!payload.payment && !payload.subscription) {
    throw new Error("Invalid Asaas webhook payload: missing payment or subscription")
  }
  return payload
}
