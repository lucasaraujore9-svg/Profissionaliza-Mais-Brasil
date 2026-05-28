import { contextLogger } from "@/lib/logger"

// Client HTTP do engine de WhatsApp. Nomenclatura neutra — engine
// externo configurado via env (WA_GATEWAY_URL / WA_GATEWAY_API_KEY).
// Cada tenant tem uma "session" identificada por sessionName (cuid).

export type WaStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"

export interface SessionStatus {
  status: WaStatus
  connectedPhone: string | null
  qrDataUrl: string | null
}

const TIMEOUT_MS = 15_000

function gatewayConfig(): { url: string; apiKey: string } | null {
  const url = process.env.WA_GATEWAY_URL
  const apiKey = process.env.WA_GATEWAY_API_KEY
  if (!url || !apiKey) return null
  return { url: url.replace(/\/$/, ""), apiKey }
}

async function gatewayFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const cfg = gatewayConfig()
  if (!cfg) {
    throw new Error("WA gateway nao configurado (defina WA_GATEWAY_URL/API_KEY)")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS)

  try {
    const res = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": cfg.apiKey,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

function mapEngineStatus(raw: unknown): WaStatus {
  if (typeof raw !== "string") return "FAILED"
  const upper = raw.toUpperCase()
  if (
    upper === "WORKING" ||
    upper === "CONNECTING" ||
    upper === "SCAN_QR_CODE" ||
    upper === "DISCONNECTED" ||
    upper === "FAILED"
  ) {
    return upper
  }
  if (upper === "STARTING") return "CONNECTING"
  if (upper === "STOPPED") return "DISCONNECTED"
  if (upper === "PAIRING") return "SCAN_QR_CODE"
  return "FAILED"
}

/**
 * Inicia uma sessao no engine. Se ja existe, e idempotente.
 */
export async function startSession(sessionName: string): Promise<{ status: WaStatus }> {
  const res = await gatewayFetch(`/api/sessions/start`, {
    method: "POST",
    body: JSON.stringify({ name: sessionName }),
  })

  if (!res.ok && res.status !== 409 /* ja existe */) {
    const txt = await res.text().catch(() => "")
    contextLogger().error(
      { event: "wa.start_failed", sessionName, status: res.status, body: txt },
      "Falha ao iniciar sessao WhatsApp",
    )
    throw new Error(`Engine recusou start (${res.status})`)
  }

  const data = (await res.json().catch(() => ({}))) as { status?: unknown }
  return { status: mapEngineStatus(data.status) }
}

/**
 * Le status atual da sessao. Inclui QR (data URL base64) quando aplicavel.
 */
export async function getSessionStatus(
  sessionName: string,
): Promise<SessionStatus> {
  const res = await gatewayFetch(`/api/sessions/${encodeURIComponent(sessionName)}`, {
    method: "GET",
  })

  if (res.status === 404) {
    return { status: "DISCONNECTED", connectedPhone: null, qrDataUrl: null }
  }
  if (!res.ok) {
    contextLogger().warn(
      { event: "wa.status_failed", sessionName, status: res.status },
      "Falha ao consultar status da sessao",
    )
    return { status: "FAILED", connectedPhone: null, qrDataUrl: null }
  }

  const data = (await res.json().catch(() => ({}))) as {
    status?: unknown
    me?: { id?: string; phone?: string }
    qr?: string // data URL OR raw base64 OR plain URL
  }

  const status = mapEngineStatus(data.status)
  const phone = data.me?.phone ?? data.me?.id ?? null

  let qrDataUrl: string | null = null
  if (status === "SCAN_QR_CODE") {
    qrDataUrl = await fetchQrAsDataUrl(sessionName, data.qr ?? null)
  }

  return {
    status,
    connectedPhone: phone ? normalizePhone(phone) : null,
    qrDataUrl,
  }
}

async function fetchQrAsDataUrl(
  sessionName: string,
  inline: string | null,
): Promise<string | null> {
  // Caso 1: o engine ja devolveu o QR inline (data URL ou base64 puro)
  if (inline) {
    if (inline.startsWith("data:")) return inline
    if (/^[A-Za-z0-9+/=]+$/.test(inline) && inline.length > 100) {
      return `data:image/png;base64,${inline}`
    }
  }

  // Caso 2: buscar o PNG no endpoint dedicado
  try {
    const res = await gatewayFetch(
      `/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
      { method: "GET" },
    )
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") ?? "image/png"
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  return digits ? `+${digits}` : raw
}

/**
 * Para o worker da sessao no engine. Mantem credenciais salvas — para
 * encerrar a sessao no celular do usuario use logoutSession.
 */
export async function stopSession(sessionName: string): Promise<void> {
  const res = await gatewayFetch(`/api/sessions/stop`, {
    method: "POST",
    body: JSON.stringify({ name: sessionName }),
  }).catch((err) => {
    contextLogger().warn(
      { err, event: "wa.stop_failed", sessionName },
      "Falha ao parar sessao no engine (ignorado)",
    )
    return null
  })
  if (res && !res.ok && res.status !== 404) {
    contextLogger().warn(
      { event: "wa.stop_non_ok", sessionName, status: res.status },
      "Engine respondeu nao-ok no stop (ignorado)",
    )
  }
}

/**
 * Encerra a sessao no celular do usuario (logout efetivo). Apaga as
 * credenciais salvas — proxima conexao precisa escanear QR de novo.
 * Requer que a sessao esteja rodando no engine para funcionar.
 */
export async function logoutSession(sessionName: string): Promise<void> {
  const res = await gatewayFetch(`/api/sessions/logout`, {
    method: "POST",
    body: JSON.stringify({ name: sessionName }),
  }).catch((err) => {
    contextLogger().warn(
      { err, event: "wa.logout_failed", sessionName },
      "Falha ao deslogar sessao no engine (ignorado)",
    )
    return null
  })
  if (res && !res.ok && res.status !== 404) {
    contextLogger().warn(
      { event: "wa.logout_non_ok", sessionName, status: res.status },
      "Engine respondeu nao-ok no logout (ignorado)",
    )
  }
}

/**
 * Exclui completamente a sessao no engine (arquivos + config + state).
 * Apos esta chamada a proxima conexao precisa criar um sessionName novo.
 */
export async function deleteSession(sessionName: string): Promise<void> {
  const res = await gatewayFetch(
    `/api/sessions/${encodeURIComponent(sessionName)}`,
    { method: "DELETE" },
  ).catch((err) => {
    contextLogger().warn(
      { err, event: "wa.delete_failed", sessionName },
      "Falha ao excluir sessao no engine (ignorado)",
    )
    return null
  })
  if (res && !res.ok && res.status !== 404) {
    contextLogger().warn(
      { event: "wa.delete_non_ok", sessionName, status: res.status },
      "Engine respondeu nao-ok no delete (ignorado)",
    )
  }
}

/**
 * Desconexao completa: logout → stop → delete. Cada passo e tolerante a
 * falhas (logs warn) — garante que o estado local sempre limpe mesmo se
 * o engine estiver fora do ar. Apos esta chamada, callers devem zerar
 * o sessionName no banco para que um novo nome seja gerado na proxima
 * conexao (a sessao no engine foi apagada).
 */
export async function disconnectSession(sessionName: string): Promise<void> {
  await logoutSession(sessionName)
  await stopSession(sessionName)
  await deleteSession(sessionName)
}

interface SendTextMessageArgs {
  sessionName: string
  toPhone: string // E.164 com + (ex: +5511999999999)
  body: string
}

/**
 * Envia mensagem de texto via engine. Retorna ID engine-side para log.
 */
export async function sendTextMessage(
  args: SendTextMessageArgs,
): Promise<{ engineMessageId: string }> {
  const chatId = toChatId(args.toPhone)
  const res = await gatewayFetch(`/api/sendText`, {
    method: "POST",
    body: JSON.stringify({
      session: args.sessionName,
      chatId,
      text: args.body,
    }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`Engine rejeitou envio (${res.status}): ${txt.slice(0, 200)}`)
  }

  const data = (await res.json().catch(() => ({}))) as {
    id?: string
    messageId?: string
    _data?: { id?: { id?: string } }
  }
  const engineMessageId =
    data.id ?? data.messageId ?? data._data?.id?.id ?? "unknown"
  return { engineMessageId }
}

function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return `${digits}@c.us`
}
