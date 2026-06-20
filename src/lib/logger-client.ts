/**
 * Logger client-side (browser). NÃO importa Pino — Pino depende de APIs
 * Node que não existem no browser e estoura o bundle em ~80kb.
 *
 * Saída: JSON via console.* — quando o user reportar bug, o time pega o
 * print do DevTools e tem o evento estruturado. Em produção, erros (level
 * "error") também são encaminhados via beacon a /api/observability/client-log
 * (ver função `ship`), de onde chegam ao log estruturado do servidor.
 *
 * Use em components React, error boundaries, hooks. NUNCA em src/lib/*
 * server (use src/lib/logger.ts).
 */

type Level = "debug" | "info" | "warn" | "error"

interface LogPayload {
  level: Level
  msg: string
  time: string
  [key: string]: unknown
}

const isProduction =
  typeof process !== "undefined" && process.env.NODE_ENV === "production"

/**
 * Campos sensíveis que NUNCA devem aparecer em logs client. Lista mais
 * curta que server porque client só vê o que renderiza — mas defesa em
 * profundidade é cheap.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "apiKey",
  "secret",
  "cpf",
  "cnpj",
  "cardNumber",
  "cvv",
])

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value
  if (typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = "[REDACTED]"
    } else {
      out[k] = sanitize(v, depth + 1)
    }
  }
  return out
}

// OBS-001: encaminha erros do client para o servidor (Vercel Runtime Logs) via
// beacon. É o que torna verdadeira a mensagem "já fomos notificados" das error
// boundaries. Best-effort, só em produção e só para `error` (evita ruído/loop).
function ship(level: Level, payload: LogPayload): void {
  if (!isProduction || level !== "error" || typeof window === "undefined") return
  try {
    const body = JSON.stringify({
      level,
      msg: payload.msg,
      url: window.location?.href,
      digest: typeof payload.digest === "string" ? payload.digest : undefined,
      context: payload,
    })
    const endpoint = "/api/observability/client-log"
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" })
      if (navigator.sendBeacon(endpoint, blob)) return
    }
    void fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {})
  } catch {
    // best-effort
  }
}

function emit(level: Level, ctx: Record<string, unknown>, msg: string): void {
  const payload: LogPayload = {
    level,
    msg,
    time: new Date().toISOString(),
    ...(sanitize(ctx) as Record<string, unknown>),
  }
  // Em prod: JSON compacto pra fácil cópia. Em dev: pretty.
  if (isProduction) {
    console[level === "debug" ? "log" : level](JSON.stringify(payload))
  } else {
    console[level === "debug" ? "log" : level](`[${level}] ${msg}`, payload)
  }
  ship(level, payload)
}

export const clientLogger = {
  debug: (ctx: Record<string, unknown>, msg: string) => emit("debug", ctx, msg),
  info: (ctx: Record<string, unknown>, msg: string) => emit("info", ctx, msg),
  warn: (ctx: Record<string, unknown>, msg: string) => emit("warn", ctx, msg),
  error: (ctx: Record<string, unknown>, msg: string) => emit("error", ctx, msg),
}
