import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import type { AsaasWebhookPayload } from "./types"
import { contextLogger } from "@/lib/logger"

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function matches(headerToken: string, expected: string): boolean {
  const a = Buffer.from(headerToken)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROTAÇÃO SEM JANELA DE 401 — `ASAAS_WEBHOOK_TOKEN_PREVIOUS`
 *
 * `ASAAS_WEBHOOK_TOKEN` é uma env do tipo Secret na Vercel: o valor NÃO pode ser
 * lido de volta. Então recadastrar o webhook no painel do Asaas obriga a criar
 * um token novo — e com um único token aceito isso abre uma janela em que TODA
 * entrega toma 401: a que ativa a unidade que acabou de pagar, a que suspende a
 * inadimplente, a que credita comissão. O Asaas até reentrega, mas depois de uma
 * sequência de falhas ele PAUSA a fila, e a fila pausada não volta sozinha.
 *
 * Por isso a validação aceita, além do token corrente, um token de TRANSIÇÃO.
 * O procedimento fica sem buraco:
 *
 *   1. `ASAAS_WEBHOOK_TOKEN_PREVIOUS` = token que o Asaas usa hoje;
 *      `ASAAS_WEBHOOK_TOKEN` = token novo. Redeploy (env sozinha não alcança
 *      deployment em execução).
 *   2. Trocar no painel do Asaas para o token novo — sem pressa, os dois valem.
 *   3. Quando nenhuma entrega casar mais pelo antigo (o log
 *      `asaas.webhook.previous_token_used` para de aparecer), REMOVER
 *      `ASAAS_WEBHOOK_TOKEN_PREVIOUS` e redeployar.
 *
 * O passo 3 não é opcional: deixar o token velho valendo para sempre anula o
 * motivo de ter rotacionado. O log existe para dizer QUANDO é seguro removê-lo.
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
  if (matches(headerToken, expectedToken)) return true

  // Token de transição. O `!previousToken` cobre env ausente E env em branco;
  // a segunda é defesa em profundidade redundante (um header vazio já morre na
  // guarda acima), mantida para que o valor em branco nunca chegue a `matches`.
  const previousToken = process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS
  if (!previousToken) return false
  if (!matches(headerToken, previousToken)) return false

  contextLogger().warn(
    { event: "asaas.webhook.previous_token_used" },
    "webhook Asaas autenticado pelo token ANTERIOR — rotação em andamento; remova ASAAS_WEBHOOK_TOKEN_PREVIOUS quando este log parar",
  )
  return true
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
