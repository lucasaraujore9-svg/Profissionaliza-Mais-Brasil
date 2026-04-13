import { createHmac, timingSafeEqual } from "node:crypto"
import type { MPWebhookNotification } from "./types"

/**
 * Valida a assinatura HMAC SHA256 do webhook do Mercado Pago.
 *
 * MP envia headers:
 *  - x-signature: "ts=<timestamp>,v1=<hash>"
 *  - x-request-id: <request id>
 *
 * O template para gerar o hash:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * @param xSignature header x-signature
 * @param xRequestId header x-request-id
 * @param dataId data.id do payload (enviado como query param `data.id`)
 * @param secret MP webhook secret (configurado no painel MP por revendedor)
 */
export function validateMpWebhookSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string,
): boolean {
  if (!xSignature || !xRequestId || !dataId) return false

  const parts = xSignature.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=")
    if (k && v) acc[k.trim()] = v.trim()
    return acc
  }, {})

  const ts = parts.ts
  const hash = parts.v1
  if (!ts || !hash) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const computed = createHmac("sha256", secret).update(manifest).digest("hex")

  if (computed.length !== hash.length) return false
  return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"))
}

/**
 * Extrai o payment ID do payload/query do webhook.
 * MP envia apenas o ID — é preciso chamar GET /v1/payments/{id} para detalhes.
 */
export function extractPaymentIdFromNotification(
  body: MPWebhookNotification | null,
  queryDataId: string | null,
): string | null {
  if (body?.data?.id) return body.data.id
  if (queryDataId) return queryDataId
  return null
}
