import { describe, it, expect, vi, beforeEach } from "vitest"

// API-009: o endpoint público de parcelas (PMB) precisa aplicar rate-limit
// ANTES de disparar a chamada externa ao MP (abuso / enumeração de BIN /
// exaustão da cota MP). Testa o gate 429 e o caminho feliz.
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
  rateLimitResponse: (r: { retryAfterSec: number; limit: number }) =>
    new Response(JSON.stringify({ error: "rate", code: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Retry-After": String(r.retryAfterSec || 1) },
    }),
  RATE_LIMITS: { installments: { name: "installments", limit: 20, windowSec: 60, failOpen: true } },
}))
vi.mock("@/lib/system-settings", () => ({
  getPmbMpAccessTokenAsync: vi.fn(),
}))
vi.mock("@/lib/mercadopago/client", () => ({
  getCardInstallments: vi.fn(),
  MPApiError: class MPApiError extends Error {
    statusCode: number
    constructor(m: string, s: number) {
      super(m)
      this.statusCode = s
    }
  },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { rateLimit } from "@/lib/ratelimit"
import { getPmbMpAccessTokenAsync } from "@/lib/system-settings"
import { getCardInstallments } from "@/lib/mercadopago/client"
import { POST } from "./route"

const rateLimitMock = rateLimit as unknown as ReturnType<typeof vi.fn>
const getTokenMock = getPmbMpAccessTokenAsync as unknown as ReturnType<typeof vi.fn>
const getInstallmentsMock = getCardInstallments as unknown as ReturnType<typeof vi.fn>

function req(body: unknown) {
  return new Request("http://x/api/checkout/installments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  rateLimitMock.mockReset()
  getTokenMock.mockReset()
  getInstallmentsMock.mockReset()
})

describe("checkout/installments — rate limit (API-009)", () => {
  it("estourou o rate-limit: responde 429 e NÃO chama o MP", async () => {
    rateLimitMock.mockResolvedValue({ ok: false, remaining: 0, limit: 20, retryAfterSec: 42 })

    const res = await POST(req({ amount: 100, bin: "411111" }))

    expect(res.status).toBe(429)
    expect(getTokenMock).not.toHaveBeenCalled()
    expect(getInstallmentsMock).not.toHaveBeenCalled()
  })

  it("dentro do limite: prossegue e consulta o MP", async () => {
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 19, limit: 20, retryAfterSec: 0 })
    getTokenMock.mockResolvedValue("TOKEN")
    getInstallmentsMock.mockResolvedValue([{ installments: 1 }])

    const res = await POST(req({ amount: 100, bin: "411111" }))

    expect(res.status).toBe(200)
    expect(getInstallmentsMock).toHaveBeenCalledTimes(1)
    const body = await res.json()
    expect(body.data.reason).toBe("ok")
  })
})
