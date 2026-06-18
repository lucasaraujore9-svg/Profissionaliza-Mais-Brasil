import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
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

// Schema TOLERANTE (passthrough): valida os campos de que o processamento
// depende sem rejeitar webhooks legítimos quando o Asaas adiciona campos novos.
// `value` é exigido apenas dentro de `payment` (usado em cobranças/comissão).
const asaasPaymentSchema = z
  .object({
    id: z.string().min(1),
    value: z.number(),
    status: z.string(),
    dueDate: z.string(),
    subscription: z.string().nullable().optional(),
    externalReference: z.string().nullable().optional(),
  })
  .passthrough()

const asaasSubscriptionSchema = z
  .object({ id: z.string().min(1) })
  .passthrough()

const asaasWebhookSchema = z
  .object({
    event: z.string().min(1),
    payment: asaasPaymentSchema.optional(),
    subscription: asaasSubscriptionSchema.optional(),
  })
  .refine((p) => Boolean(p.payment || p.subscription), {
    message: "missing payment or subscription",
  })

/**
 * Parse e valida o payload do webhook via Zod.
 *
 * `event` é sempre obrigatório. `payment` aparece em PAYMENT_* events,
 * `subscription` em SUBSCRIPTION_* events — exigimos pelo menos um. Antes era um
 * `as AsaasWebhookPayload` cego (sem validação real, contradizendo o comentário
 * "validação Zod" na rota); agora um corpo malformado é rejeitado com 400 em vez
 * de explodir adiante ao acessar campos ausentes.
 */
export function parseAsaasWebhookPayload(
  body: unknown,
): AsaasWebhookPayload {
  const parsed = asaasWebhookSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error(`Invalid Asaas webhook payload: ${parsed.error.issues[0]?.message ?? "schema"}`)
  }
  // passthrough preserva todos os campos; cast seguro para o tipo de domínio.
  return body as AsaasWebhookPayload
}
