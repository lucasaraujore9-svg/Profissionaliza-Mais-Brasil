import { describe, it, expect, vi, beforeEach } from "vitest"

// OBS-009: beacon público anônimo — fail-closed no rate-limit + eventos marcados
// como não confiáveis (source/trusted).

const logError = vi.fn()
const rateLimitMock = vi.fn()

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  rateLimitResponse: () => new Response(JSON.stringify({ code: "RATE_LIMITED" }), { status: 429 }),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ error: logError, warn: vi.fn() }),
}))

import { POST } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
})

function req(body: unknown): Request {
  return new Request("http://x/api/observability/client-log", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

describe("client-log beacon (OBS-009)", () => {
  it("usa rate-limit fail-closed (failOpen:false) para este endpoint", async () => {
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 1, limit: 30, retryAfterSec: 0 })
    await POST(req({ level: "error", msg: "boom" }))
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "client-log", failOpen: false }),
    )
  })

  it("bloqueado pelo rate-limit → 429 e não loga", async () => {
    rateLimitMock.mockResolvedValue({ ok: false, remaining: 0, limit: 30, retryAfterSec: 60 })
    const res = await POST(req({ level: "error", msg: "boom" }))
    expect(res.status).toBe(429)
    expect(logError).not.toHaveBeenCalled()
  })

  it("marca o evento como beacon não confiável (source/trusted:false)", async () => {
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 1, limit: 30, retryAfterSec: 0 })
    const res = await POST(req({ level: "error", msg: "erro do client", url: "/x" }))
    expect(res.status).toBe(200)
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "client.error",
        source: "client-beacon",
        trusted: false,
        clientMsg: "erro do client",
      }),
      expect.any(String),
    )
  })
})
