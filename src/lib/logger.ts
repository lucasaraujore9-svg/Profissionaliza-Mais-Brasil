/**
 * Logger estruturado (Pino) com sanitização rigorosa de dados sensíveis.
 *
 * Por que Pino e não Winston:
 *   - JSON-first nativo (sem formatter), ~5x mais rápido em serverless
 *   - redact built-in com path matching
 *   - child loggers herdam contexto sem custo
 *   - bundle leve (~30kb) — importa em Fluid Compute sem dor
 *
 * Como usar:
 *   import { logger } from "@/lib/logger"
 *   logger.info({ tenantId, action: "fulfill_enrollment" }, "matricula criada")
 *   logger.error({ err, paymentId }, "falha ao processar webhook MP")
 *
 *   // Com contexto herdado:
 *   const log = logger.child({ requestId, tenantId })
 *   log.warn({ studentId }, "block falhou — vai retentar")
 *
 *   // De dentro de handler que usa runWithRequestContext:
 *   import { contextLogger } from "@/lib/logger"
 *   contextLogger().info({ action: "x" }, "msg")  // já vem com requestId/tenantId
 *
 * Edge runtime (proxy/middleware): NÃO importar este arquivo. Pino usa APIs
 * Node (process.stdout). Para edge, use console direto ou um fallback dedicado.
 */
import pino from "pino"
import { getRequestContext } from "@/lib/observability/request-context"
import { createHttpLogStream } from "@/lib/observability/log-transport"

const isProduction = process.env.NODE_ENV === "production"
const isTest = process.env.NODE_ENV === "test"

/**
 * Campos que devem ser mascarados em qualquer log. Pino aplica antes da
 * serialização — o valor original nunca toca stdout.
 *
 * Estratégia:
 *   - `*.password*`, `*.token*`, etc. capturam variações nested
 *   - Headers de webhook (asaas-access-token, x-signature MP) explícitos
 *   - Cookies e Authorization sempre redactados
 *
 * Importante: adicione NOVOS campos sensíveis aqui ao introduzir features.
 * Não confie em "ninguém vai logar isso" — defesa em profundidade.
 */
const REDACT_PATHS = [
  // Credenciais
  "password",
  "*.password",
  "*.*.password",
  "newPassword",
  "currentPassword",
  "passwordHash",
  "*.passwordHash",

  // Tokens
  "token",
  "*.token",
  "*.*.token",
  "accessToken",
  "*.accessToken",
  "mpAccessToken",
  "*.mpAccessToken",
  "asaasApiKey",
  "*.asaasApiKey",
  "encryptionKey",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",

  // Headers HTTP sensíveis
  'headers["authorization"]',
  'headers["cookie"]',
  'headers["asaas-access-token"]',
  'headers["x-signature"]',
  'headers["x-webhook-token"]',
  'req.headers["authorization"]',
  'req.headers["cookie"]',
  'req.headers["asaas-access-token"]',

  // Dados pessoais (LGPD — masking parcial seria melhor, mas redact zera o risco)
  "cpf",
  "*.cpf",
  "cnpj",
  "*.cnpj",
  "rg",
  "*.rg",

  // Cartão/financeiro
  "cardNumber",
  "*.cardNumber",
  "cvv",
  "*.cvv",
  "creditCard",
  "*.creditCard",

  // Crypto material
  "iv",
  "ciphertext",
  "*.encrypted",
] as const

/**
 * Serializer para Error que preserva stack mas evita objetos circulares
 * e remove props customizadas que possam ter payload sensível (e.g. erros
 * de fetch que carregam request body inteiro).
 */
function errorSerializer(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { type: typeof err, value: String(err) }
  }
  const out: Record<string, unknown> = {
    type: err.name,
    message: err.message,
    stack: err.stack,
  }
  // cause é padrão ES2022, preservar mas serializar recursivamente
  if ("cause" in err && err.cause) {
    out.cause = errorSerializer(err.cause)
  }
  return out
}

const baseOptions: pino.LoggerOptions = {
  level: isTest ? "silent" : process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: [...REDACT_PATHS],
    censor: "[REDACTED]",
  },
  serializers: {
    err: errorSerializer,
    error: errorSerializer,
  },
  base: {
    env: process.env.NODE_ENV,
    service: "pmb-app",
  },
  // Timestamp ISO pra parsing fácil em qualquer ingestion
  timestamp: pino.stdTimeFunctions.isoTime,
}

/**
 * Constrói a instância Pino:
 *   - dev/test: pretty stdout (legível durante desenvolvimento)
 *   - prod: JSON em stdout + opcional fan-out HTTP (Axiom-compatible)
 *     se AXIOM_TOKEN/AXIOM_DATASET estiverem setados. Sem essas envs,
 *     somente stdout — Vercel Log Drain leva pra qualquer aggregator.
 */
function createLogger(): pino.Logger {
  if (!isProduction && !isTest) {
    return pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    })
  }

  const httpStream = createHttpLogStream()
  if (!httpStream) {
    // Caminho default em produção — stdout JSON puro.
    return pino(baseOptions)
  }

  // Fan-out: stdout + HTTP transport. Stdout permanece como source-of-truth
  // (Vercel ainda agrega, drains funcionam) — HTTP é canal secundário.
  return pino(
    baseOptions,
    pino.multistream([
      { stream: process.stdout },
      { stream: httpStream },
    ]),
  )
}

export const logger = createLogger()

/**
 * Retorna um logger filho com o contexto do request atual (requestId,
 * tenantId, userId, action). Usa AsyncLocalStorage — funciona em qualquer
 * profundidade da call stack sem prop drilling.
 *
 * Fora de um request context (jobs cron sem wrap, scripts), devolve o
 * logger raiz.
 */
export function contextLogger() {
  const ctx = getRequestContext()
  if (!ctx) return logger
  return logger.child(ctx)
}

/**
 * Helper para logar e re-lançar — útil em try/catch onde queremos
 * observabilidade mas o erro deve propagar (webhook que precisa retornar
 * 500 pra cliente retentar).
 */
export function logAndRethrow(
  ctx: Record<string, unknown>,
  message: string,
): (err: unknown) => never {
  return (err: unknown) => {
    contextLogger().error({ ...ctx, err }, message)
    throw err
  }
}
