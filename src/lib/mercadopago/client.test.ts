import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// API-010: createPreapproval/createPreference passam X-Idempotency-Key, e o
// retry em 5xx reenvia a MESMA chave — evita assinatura/preferência duplicada.
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createPreapproval, createPreference } from "./client"
import type {
  MPCreatePreapprovalParams,
  MPCreatePreferenceParams,
} from "./types"

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response
}

function idempotencyKeysFrom(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => {
    const init = c[1] as RequestInit
    const headers = init.headers as Record<string, string>
    return headers["X-Idempotency-Key"]
  })
}

const fetchMock = vi.fn()
const realFetch = globalThis.fetch

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  globalThis.fetch = realFetch
})

const preapprovalParams = {
  reason: "Mensalidade",
  external_reference: "enr-1",
  payer_email: "a@b.com",
  auto_recurring: {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 100,
    currency_id: "BRL",
  },
} as unknown as MPCreatePreapprovalParams

describe("createPreapproval — idempotência no retry (API-010)", () => {
  it("502 na 1ª, 200 na 2ª: reenvia a MESMA X-Idempotency-Key e cria 1 assinatura", async () => {
    fetchMock
      .mockResolvedValueOnce(res(502, { message: "bad gateway" }))
      .mockResolvedValueOnce(res(200, { id: "sub-1", init_point: "http://x" }))

    const out = await createPreapproval("TOKEN", preapprovalParams, "enr-1")

    expect(out.id).toBe("sub-1")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const keys = idempotencyKeysFrom(fetchMock)
    expect(keys[0]).toBe("enr-1")
    expect(keys[1]).toBe("enr-1")
    // Só 1 chave distinta → o MP dedupe a 2ª como a mesma criação.
    expect(new Set(keys).size).toBe(1)
    // Ambas as tentativas foram ao endpoint de assinatura.
    for (const c of fetchMock.mock.calls) {
      expect(String(c[0])).toContain("/preapproval")
    }
  })
})

describe("createPreference — idempotência no retry (API-010)", () => {
  it("envia X-Idempotency-Key = chave fornecida", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { id: "pref-1", init_point: "http://x" }))

    const out = await createPreference(
      "TOKEN",
      { items: [] } as unknown as MPCreatePreferenceParams,
      "extref-9",
    )

    expect(out.id).toBe("pref-1")
    expect(idempotencyKeysFrom(fetchMock)[0]).toBe("extref-9")
  })
})
