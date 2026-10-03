/**
 * Webhooks de SAÍDA (PMB → sistema integrado) — parte PURA, sem Node: a tela
 * do admin (client) importa os rótulos daqui. Criptografia mora em `secret.ts`.
 *
 * Catálogo FECHADO de eventos: evento fora daqui é ignorado na entrega, e o
 * contrato público (docs/api/parceiros-v1.md) lista exatamente estes nomes.
 * Adicionar evento é retrocompatível; mudar o significado de um não é.
 */

export const WEBHOOK_EVENTS = [
  "unidade.criada",
  "unidade.pagamento.confirmado",
  "unidade.pagamento.vencido",
  "unidade.pagamento.estornado",
  "unidade.ativada",
  "unidade.suspensa",
  "unidade.cancelada",
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** Disparado só pelo botão "Enviar teste" — não é assinável. */
export const TEST_EVENT = "webhook.teste"

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "unidade.criada": "Unidade criada (admin, painel, API ou cadastro público)",
  "unidade.pagamento.confirmado": "Mensalidade da unidade paga",
  "unidade.pagamento.vencido": "Mensalidade da unidade venceu sem pagamento",
  "unidade.pagamento.estornado": "Mensalidade da unidade estornada",
  "unidade.ativada": "Unidade ativada ou reativada",
  "unidade.suspensa": "Unidade suspensa",
  "unidade.cancelada": "Unidade cancelada",
}

const EVENT_SET = new Set<string>(WEBHOOK_EVENTS)
export function isWebhookEvent(value: string): value is WebhookEvent {
  return EVENT_SET.has(value)
}

/**
 * Espera antes da tentativa N+1, depois de N falhas. Esgotou a lista = FAILED.
 * Cobre ~1 dia e meio: o bastante para atravessar uma janela de manutenção do
 * lado de lá sem acumular tentativas para sempre.
 */
const RETRY_DELAYS_MIN = [1, 5, 30, 120, 360, 1440]
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1

export function nextAttemptDelayMs(failedAttempts: number): number | null {
  const min = RETRY_DELAYS_MIN[failedAttempts - 1]
  return min === undefined ? null : min * 60_000
}

/**
 * URL de destino aceita. Só HTTPS e nunca endereço interno: quem cadastra é
 * admin, mas a requisição sai do NOSSO servidor — um `http://169.254.169.254`
 * aqui viraria leitura de metadado da nuvem.
 *
 * ponytail: confere só o hostname literal; um domínio que RESOLVE para IP
 * privado passa. Para fechar isso, resolver o DNS antes de cada entrega.
 */
export function webhookUrlError(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "URL inválida."
  }
  if (url.protocol !== "https:") return "Use uma URL https://."
  if (url.username || url.password) return "Não coloque usuário/senha na URL."
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6 literal: loopback, ULA (fc00::/7) e link-local. Só olha prefixo
    // quando tem ":", senão "fcbarcelona.com" cairia aqui.
    (host.includes(":") && (host === "::1" || /^f[cd]|^fe80:|^::ffff:/.test(host)))
  ) {
    return "Endereço interno não é permitido."
  }
  return null
}
