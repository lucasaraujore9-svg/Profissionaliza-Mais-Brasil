/**
 * Redação de PII no payload de webhook ANTES de persistir em `WebhookLog.payload`
 * (OBS-008 / LGPD-014).
 *
 * O corpo cru dos webhooks vai direto ao Prisma — FORA do pipeline de redact do
 * Pino (que só redige o que passa pelo logger). Sem esta função:
 *   - Asaas: `customer.cpfCnpj/email/phone/mobilePhone` (dados do titular) ficam
 *     em claro no Postgres.
 *   - LMS `student.question.created`: `body` é texto livre do aluno (até 4000
 *     chars) — pode conter dado pessoal/sensível em claro.
 *
 * Estratégia: mascara chaves de PII identificáveis (CPF/CNPJ/RG/e-mail/telefone)
 * em qualquer nível, e substitui campos de texto livre (`body`) por um marcador
 * com o tamanho (preserva sinal de debug sem o conteúdo). MANTÉM ids, status,
 * valores e demais campos para troubleshooting/reprocessamento.
 *
 * Não é criptografia — é minimização. O objetivo é não deixar PII em repouso no
 * banco. Nenhum caminho de reprocessamento lê `WebhookLog.payload` (os
 * processadores usam o corpo parseado em memória ou re-buscam pela API), então
 * redigir o payload persistido é seguro.
 */

const REDACTED = "[REDACTED]"

// Chaves (case-insensitive) cujo VALOR é PII direta e deve ser mascarado.
const PII_KEYS = new Set([
  "cpf",
  "cpfcnpj",
  "cnpj",
  "rg",
  "email",
  "phone",
  "mobilephone",
  "homephone",
  "telefone",
  "celular",
  "phonenumber",
])

// Chaves cujo VALOR é texto livre (pode conter PII em prosa) — trocado por um
// marcador que preserva só o tamanho.
const FREE_TEXT_KEYS = new Set(["body"])

const MAX_DEPTH = 8

export function redactWebhookPayload(value: unknown, depth = 0): unknown {
  // Guarda contra estruturas muito profundas/cíclicas.
  if (depth > MAX_DEPTH) return REDACTED

  if (Array.isArray(value)) {
    return value.map((v) => redactWebhookPayload(v, depth + 1))
  }

  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase()
      if (PII_KEYS.has(key)) {
        out[k] = REDACTED
      } else if (FREE_TEXT_KEYS.has(key) && typeof v === "string") {
        out[k] = `[REDACTED:free-text len=${v.length}]`
      } else {
        out[k] = redactWebhookPayload(v, depth + 1)
      }
    }
    return out
  }

  return value
}
