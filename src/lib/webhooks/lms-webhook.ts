import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Validação dos webhooks de ENTRADA do LMS (LMS -> PMB, POST /api/webhooks/lms).
 *
 * O LMS assina cada entrega por HMAC-SHA256 sobre `"<timestamp>.<rawBody>"` com
 * o segredo compartilhado `PMB_WEBHOOK_SECRET`. Headers de cada entrega:
 *   X-PMB-Event-Id    <uuid>           (idempotência, estável entre retries)
 *   X-PMB-Event-Type  course.completed (tipo do evento)
 *   X-PMB-Timestamp   1718822400       (epoch — segundos ou ms)
 *   X-PMB-Signature   sha256=<hmac-hex>
 *
 * Espelha o padrão do webhook do Mercado Pago (src/lib/mercadopago/webhook.ts):
 * comparação em tempo constante + janela anti-replay.
 */

// Janela anti-replay: rejeita entregas cujo `ts` esteja fora desta janela.
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000

/** Normaliza o timestamp (epoch s/ms) para milissegundos. null se implausível. */
function tsToMillis(ts: string): number | null {
  if (!/^\d{9,14}$/.test(ts)) return null
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return null
  return ts.length >= 13 ? n : n * 1000
}

/**
 * Valida a assinatura do webhook do LMS. Retorna false em qualquer divergência
 * (assinatura ausente/ inválida, timestamp fora da janela, formato inesperado).
 *
 * @param timestamp header X-PMB-Timestamp (string exata usada no manifest)
 * @param rawBody corpo cru da requisição (string exata recebida)
 * @param signatureHeader header X-PMB-Signature ("sha256=<hex>" ou "<hex>")
 * @param secret PMB_WEBHOOK_SECRET
 */
export function validateLmsWebhookSignature(
  timestamp: string | null,
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): boolean {
  if (!timestamp || !signatureHeader) return false

  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7).trim()
    : signatureHeader.trim()
  if (!/^[0-9a-f]+$/i.test(provided)) return false

  // Anti-replay: o ts faz parte do manifest assinado (não forjável sem o
  // secret), mas uma entrega antiga válida poderia ser reenviada.
  const tsMs = tsToMillis(timestamp)
  if (tsMs === null) return false
  if (Math.abs(Date.now() - tsMs) > maxAgeMs) return false

  const manifest = `${timestamp}.${rawBody}`
  const computed = createHmac("sha256", secret).update(manifest).digest("hex")

  if (computed.length !== provided.length) return false
  try {
    return timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(provided, "hex"),
    )
  } catch {
    return false
  }
}
