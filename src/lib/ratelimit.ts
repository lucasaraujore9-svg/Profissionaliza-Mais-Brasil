import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

interface LimiterConfig {
  /** Identificador unico do bucket. */
  name: string
  /** Numero maximo de requests na janela. */
  limit: number
  /** Janela em segundos. */
  windowSec: number
}

const limiters = new Map<string, Ratelimit>()

function getLimiter(config: LimiterConfig): Ratelimit | null {
  if (!redis) return null
  const cached = limiters.get(config.name)
  if (cached) return cached
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSec} s`),
    analytics: false,
    prefix: `rl:${config.name}`,
  })
  limiters.set(config.name, limiter)
  return limiter
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  limit: number
  retryAfterSec: number
}

/**
 * Aplica rate limit baseado em IP + bucket nominal. Se o Redis nao estiver
 * configurado (dev local, fallback), libera silenciosamente.
 */
export async function rateLimit(
  request: Request,
  config: LimiterConfig,
): Promise<RateLimitResult> {
  const limiter = getLimiter(config)
  if (!limiter) {
    return {
      ok: true,
      remaining: config.limit,
      limit: config.limit,
      retryAfterSec: 0,
    }
  }

  const ip = ipFrom(request)
  const key = `${config.name}:${ip}`
  const r = await limiter.limit(key)

  return {
    ok: r.success,
    remaining: r.remaining,
    limit: r.limit,
    retryAfterSec: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)),
  }
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Muitas requisições. Tente novamente em alguns segundos.",
      code: "RATE_LIMITED",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec || 1),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  )
}

function ipFrom(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  const real = request.headers.get("x-real-ip")
  if (real) return real
  return "anon"
}

// Buckets pre-definidos para rotas criticas.
export const RATE_LIMITS = {
  authLogin: { name: "auth-login", limit: 8, windowSec: 60 },
  authForgot: { name: "auth-forgot", limit: 4, windowSec: 60 },
  authReset: { name: "auth-reset", limit: 6, windowSec: 60 },
  leads: { name: "leads", limit: 6, windowSec: 60 },
  publicCheckout: { name: "loja-checkout", limit: 10, windowSec: 60 },
  publicCupom: { name: "loja-cupom", limit: 20, windowSec: 60 },
  revendedorCadastro: { name: "rev-cadastro", limit: 5, windowSec: 600 },
  cobrancaPayCard: { name: "cobranca-paycard", limit: 5, windowSec: 60 },
} as const
