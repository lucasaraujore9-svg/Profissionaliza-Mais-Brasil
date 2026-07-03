import { contextLogger } from "@/lib/logger"
import { env } from "@/lib/env"

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
// Retry só no ENVIO (sendTextMessage): um 5xx/timeout transitório do engine não
// pode perder o disparo de automação em definitivo. Espelha lib/lms/client.ts.
const SEND_MAX_RETRIES = 2 // 3 tentativas no total
const SEND_BACKOFF_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function gatewayConfig(): { url: string; apiKey: string } | null {
  const url = env.WA_GATEWAY_URL
  const apiKey = env.WA_GATEWAY_API_KEY
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
        Accept: "application/json",
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

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    // Idempotente: a sessao ja estar de pe NAO e erro. Engines diferentes
    // sinalizam isso de formas distintas: 409 (Conflict / "already exists") ou
    // 422 ("Session '...' is already started/running"). Nesses casos seguimos
    // adiante — quem entrega o QR/estado atual e o getSessionStatus no caller.
    const alreadyUp =
      res.status === 409 ||
      (res.status === 422 && /already\s+(started|exists|running)/i.test(txt))
    if (!alreadyUp) {
      contextLogger().error(
        { event: "wa.start_failed", sessionName, status: res.status, body: txt },
        "Falha ao iniciar sessao WhatsApp",
      )
      throw new Error(`Engine recusou start (${res.status})`)
    }
    return { status: "CONNECTING" }
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

  // Caso 2: buscar o QR no endpoint dedicado. Forca Accept de imagem (o
  // default application/json do gatewayFetch pode atrapalhar a negociacao) e
  // tolera tanto PNG binario quanto JSON com base64 embutido.
  try {
    const res = await gatewayFetch(
      `/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
      {
        method: "GET",
        headers: { Accept: "image/png,image/*;q=0.9,*/*;q=0.8" },
      },
    )
    const contentType = res.headers.get("content-type") ?? ""
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      contextLogger().warn(
        {
          event: "wa.qr_fetch_failed",
          sessionName,
          status: res.status,
          contentType,
          bodyPreview: body.slice(0, 200),
        },
        "Falha ao buscar QR no engine",
      )
      return null
    }
    // Algumas versoes devolvem JSON { data|value: base64, mimetype }
    if (contentType.includes("application/json")) {
      const json = (await res.json().catch(() => ({}))) as {
        data?: string
        value?: string
        mimetype?: string
      }
      const b64 = json.data ?? json.value
      if (b64 && /^[A-Za-z0-9+/=]+$/.test(b64) && b64.length > 100) {
        return `data:${json.mimetype ?? "image/png"};base64,${b64}`
      }
      contextLogger().warn(
        { event: "wa.qr_json_unhandled", sessionName, keys: Object.keys(json) },
        "QR retornou JSON em formato inesperado",
      )
      return null
    }
    // PNG binario
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) {
      contextLogger().warn(
        { event: "wa.qr_empty", sessionName, contentType },
        "QR retornou corpo vazio",
      )
      return null
    }
    return `data:${contentType || "image/png"};base64,${buf.toString("base64")}`
  } catch (err) {
    contextLogger().warn(
      { err, event: "wa.qr_fetch_error", sessionName },
      "Erro ao buscar QR no engine",
    )
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
 * Lancado quando o check-exists confirma que o numero NAO possui WhatsApp
 * (numberExists=false). Permite ao caller tratar este caso de forma distinta
 * de uma falha generica do engine (ex: mostrar "numero sem WhatsApp" na UI).
 */
export class WhatsAppNumberNotFoundError extends Error {
  readonly phone: string
  constructor(phone: string) {
    super(`Numero ${phone} nao possui WhatsApp`)
    this.name = "WhatsAppNumberNotFoundError"
    this.phone = phone
  }
}

/**
 * Resolve o chatId REAL do numero no WhatsApp antes de enviar.
 *
 * Por que: numeros BR sofrem do "nono digito" — o id efetivamente registrado
 * no WhatsApp pode diferir do `{digits}@c.us` ingenuo (com/sem o 9 apos o DDD).
 * Disparar para o id errado faz a mensagem sumir sem erro claro. O engine
 * expoe `check-exists`, que devolve o `chatId` canonico — e esse id que deve
 * ir no POST de envio.
 *
 * Retorno:
 *  - string    -> chatId canonico (numero existe no WhatsApp)
 *  - null      -> numero NAO existe no WhatsApp (nao adianta enviar)
 *  - undefined -> lookup indisponivel/inconclusivo (usa fallback ingenuo)
 */
async function resolveChatId(
  sessionName: string,
  phone: string,
): Promise<string | null | undefined> {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return undefined
  try {
    const res = await gatewayFetch(
      `/api/contacts/check-exists?phone=${encodeURIComponent(digits)}&session=${encodeURIComponent(sessionName)}`,
      { method: "GET" },
    )
    // Endpoint ausente/erro no engine → fallback (nao bloqueia o envio)
    if (!res.ok) return undefined
    const data = (await res.json().catch(() => ({}))) as {
      numberExists?: boolean
      chatId?: string
    }
    if (data.numberExists === false) return null
    return data.chatId ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Envia mensagem de texto via engine. Retorna ID engine-side para log.
 *
 * Fluxo: (1) resolve o chatId real do numero (check-exists); (2) dispara o
 * POST de envio usando esse id. Se o numero nao tem WhatsApp, lanca erro
 * (logado como falha de envio pelo caller). Se a checagem nao estiver
 * disponivel, cai no chatId ingenuo (comportamento legado).
 */
export async function sendTextMessage(
  args: SendTextMessageArgs,
): Promise<{ engineMessageId: string }> {
  // (1) encontra o id do contato para enviar
  const resolved = await resolveChatId(args.sessionName, args.toPhone)
  if (resolved === null) {
    throw new WhatsAppNumberNotFoundError(args.toPhone)
  }
  const chatId = resolved ?? toChatId(args.toPhone)
  if (!resolved) {
    contextLogger().warn(
      { event: "wa.chatid_fallback", sessionName: args.sessionName },
      "check-exists indisponivel — usando chatId ingenuo",
    )
  }

  // (2) dispara a mensagem usando o id resolvido, com retry em falha
  // TRANSITÓRIA (5xx / rede / timeout). 4xx (requisição/sessão inválida) e
  // WhatsAppNumberNotFoundError NÃO são retentados.
  let res: Response | null = null
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= SEND_MAX_RETRIES; attempt++) {
    try {
      res = await gatewayFetch(`/api/sendText`, {
        method: "POST",
        body: JSON.stringify({
          session: args.sessionName,
          chatId,
          text: args.body,
        }),
      })
      if (res.ok) break
      // 4xx: erro terminal (não adianta retentar) — sai e trata abaixo.
      if (res.status < 500) break
      lastErr = new Error(`Engine 5xx (${res.status})`)
    } catch (err) {
      // Rede/timeout (abort): transitório — retenta.
      lastErr = err
      res = null
    }
    if (attempt < SEND_MAX_RETRIES) {
      await sleep(SEND_BACKOFF_MS * Math.pow(2, attempt))
    }
  }

  if (!res) {
    contextLogger().warn(
      { err: lastErr, event: "wa.send_retry_exhausted", sessionName: args.sessionName },
      "Falha ao enviar mensagem WhatsApp após retries (transitório)",
    )
    throw new Error(
      `Falha ao enviar após ${SEND_MAX_RETRIES + 1} tentativas: ${String(lastErr)}`,
    )
  }

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

interface RequestPairingCodeArgs {
  sessionName: string
  phone: string
}

/**
 * Solicita um codigo de pareamento (alternativa ao QR). O usuario digita esse
 * codigo no WhatsApp: Aparelhos conectados → Conectar → "Vincular com numero
 * de telefone".
 *
 * Blindagem: resolve o numero real via check-exists (mesma logica do envio)
 * antes de pedir o codigo — mitiga erro de digitacao / 9o digito BR. Lanca
 * WhatsAppNumberNotFoundError se o numero nao tiver WhatsApp. A sessao precisa
 * ja estar iniciada (SCAN_QR_CODE) — o caller chama startSession antes.
 */
export async function requestPairingCode(
  args: RequestPairingCodeArgs,
): Promise<{ code: string; phone: string }> {
  const resolved = await resolveChatId(args.sessionName, args.phone)
  if (resolved === null) {
    throw new WhatsAppNumberNotFoundError(args.phone)
  }
  // digits do chatId canonico (preferido) ou fallback do que o usuario digitou
  const phoneNumber = (resolved ?? args.phone)
    .replace(/@c\.us$/i, "")
    .replace(/\D/g, "")
  if (!phoneNumber) {
    throw new Error("Numero invalido para pareamento")
  }

  const res = await gatewayFetch(
    `/api/${encodeURIComponent(args.sessionName)}/auth/request-code`,
    { method: "POST", body: JSON.stringify({ phoneNumber }) },
  )

  const txt = await res.text().catch(() => "")
  if (!res.ok) {
    contextLogger().error(
      {
        event: "wa.request_code_failed",
        sessionName: args.sessionName,
        status: res.status,
        bodyPreview: txt.slice(0, 200),
      },
      "Engine recusou pedido de codigo de pareamento",
    )
    throw new Error(`Engine recusou request-code (${res.status})`)
  }

  // Resposta pode vir como JSON { code } ou string crua — toleramos ambos.
  let code: string | undefined
  try {
    const json = JSON.parse(txt) as { code?: string; pairingCode?: string }
    code = json.code ?? json.pairingCode
  } catch {
    code = txt.trim() || undefined
  }
  if (!code) {
    contextLogger().error(
      {
        event: "wa.request_code_no_code",
        sessionName: args.sessionName,
        bodyPreview: txt.slice(0, 200),
      },
      "request-code respondeu sem codigo",
    )
    throw new Error("Engine nao retornou o codigo de pareamento")
  }
  return { code, phone: phoneNumber }
}
