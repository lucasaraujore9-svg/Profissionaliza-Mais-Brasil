import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-005: resiliência do rate-limit. Dois pontos críticos:
//  - `runLimit` deve fazer FAIL-OPEN quando o COMANDO Redis rejeita (cota
//    Upstash estourada) para buckets de auth — senão o login toma 500 (incidente
//    dcd03fd). Buckets normais degradam para a política de fallback.
//  - `ipFrom` usa o ÚLTIMO segmento do X-Forwarded-For (o que a Vercel anexa),
//    nunca o primeiro (forjável pelo cliente).

// Env setado ANTES do import do módulo (redis é criado no load): vi.hoisted roda
// antes das importações. Assim `redis` fica truthy e alcançamos runLimit.
const { limitFn } = vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io"
  process.env.UPSTASH_REDIS_REST_TOKEN = "tok"
  return { limitFn: vi.fn() }
})

vi.mock("@upstash/redis", () => ({ Redis: class {} }))
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    limit = limitFn
  }
  ;(Ratelimit as unknown as { slidingWindow: () => unknown }).slidingWindow = () => ({})
  return { Ratelimit }
})
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { rateLimit, rateLimitByKey, RATE_LIMITS } from "./ratelimit"

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://x/api/x", { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("runLimit — fail-open em falha de comando Redis (QA-005)", () => {
  it("bucket failOpen (authLogin): comando Redis rejeita → ok:true (não trava o login)", async () => {
    limitFn.mockRejectedValue(new Error("ERR max requests limit exceeded"))
    const res = await rateLimitByKey("user@x", RATE_LIMITS.authLogin)
    expect(res.ok).toBe(true)
  })

  it("sucesso do comando reflete r.success e retorna o remaining", async () => {
    limitFn.mockResolvedValue({ success: true, remaining: 5, limit: 8, reset: Date.now() + 1000 })
    const res = await rateLimitByKey("user@x", RATE_LIMITS.authLogin)
    expect(res.ok).toBe(true)
    expect(res.remaining).toBe(5)
  })

  it("comando nega (success:false) → ok:false", async () => {
    limitFn.mockResolvedValue({ success: false, remaining: 0, limit: 8, reset: Date.now() + 5000 })
    const res = await rateLimitByKey("user@x", RATE_LIMITS.authLogin)
    expect(res.ok).toBe(false)
    expect(res.retryAfterSec).toBeGreaterThan(0)
  })
})

describe("ipFrom — anti-spoof de X-Forwarded-For (QA-005)", () => {
  beforeEach(() => {
    limitFn.mockResolvedValue({ success: true, remaining: 1, limit: 10, reset: Date.now() + 1000 })
  })

  it("prefere x-real-ip (já sanitizado pela Vercel)", async () => {
    await rateLimit(reqWith({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6" }), RATE_LIMITS.leads)
    const key = limitFn.mock.calls.at(-1)![0] as string
    expect(key.endsWith(":1.1.1.1")).toBe(true)
  })

  it("sem x-real-ip usa o ÚLTIMO segmento do XFF (não o primeiro, forjável)", async () => {
    await rateLimit(
      reqWith({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }),
      RATE_LIMITS.leads,
    )
    const key = limitFn.mock.calls.at(-1)![0] as string
    // O IP confiável é o último (anexado pela Vercel); o "1.2.3.4" forjado é ignorado.
    expect(key.endsWith(":9.9.9.9")).toBe(true)
    expect(key).not.toContain("1.2.3.4")
  })

  it("sem headers de IP → 'anon'", async () => {
    await rateLimit(reqWith({}), RATE_LIMITS.leads)
    const key = limitFn.mock.calls.at(-1)![0] as string
    expect(key.endsWith(":anon")).toBe(true)
  })
})
