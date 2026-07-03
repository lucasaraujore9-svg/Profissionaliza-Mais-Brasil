import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// API-008: sendTextMessage passa a retentar falhas TRANSITÓRIAS (5xx/rede) do
// engine, sem retentar 4xx. Config lida via @/lib/env (não process.env direto).
vi.mock("@/lib/env", () => ({
  env: { WA_GATEWAY_URL: "http://engine.local", WA_GATEWAY_API_KEY: "k" },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { sendTextMessage, WhatsAppNumberNotFoundError } from "./wa-client"

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => "application/json" },
  } as unknown as Response
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

// Helper: check-exists sempre confirma o número; sendText é controlado por `sendResponses`.
function wireFetch(sendResponses: Array<() => Response | Promise<Response>>) {
  let sendIdx = 0
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url)
    if (u.includes("/api/contacts/check-exists")) {
      return jsonRes(200, { numberExists: true, chatId: "5511999999999@c.us" })
    }
    if (u.includes("/api/sendText")) {
      const r = sendResponses[Math.min(sendIdx, sendResponses.length - 1)]
      sendIdx++
      return r()
    }
    throw new Error(`unexpected url ${u}`)
  })
  return () => sendIdx
}

describe("wa-client.sendTextMessage — retry em falha transitória (API-008)", () => {
  it("5xx na 1ª tentativa, 200 na 2ª → entrega 1 mensagem", async () => {
    const sends = wireFetch([
      () => jsonRes(503, { error: "engine down" }),
      () => jsonRes(200, { id: "msg-123" }),
    ])

    const out = await sendTextMessage({
      sessionName: "s1",
      toPhone: "+5511999999999",
      body: "oi",
    })

    expect(out.engineMessageId).toBe("msg-123")
    expect(sends()).toBe(2) // 2 POSTs a /api/sendText (1 falha + 1 sucesso)
  })

  it("erro de rede (throw) na 1ª, 200 na 2ª → entrega", async () => {
    const sends = wireFetch([
      () => {
        throw new Error("network down")
      },
      () => jsonRes(200, { messageId: "m2" }),
    ])

    const out = await sendTextMessage({
      sessionName: "s1",
      toPhone: "+5511999999999",
      body: "oi",
    })

    expect(out.engineMessageId).toBe("m2")
    expect(sends()).toBe(2)
  })

  it("4xx NÃO é retentado (erro terminal) → lança e envia só 1 vez", async () => {
    const sends = wireFetch([() => jsonRes(400, { error: "bad request" })])

    await expect(
      sendTextMessage({ sessionName: "s1", toPhone: "+5511999999999", body: "oi" }),
    ).rejects.toThrow(/Engine rejeitou envio \(400\)/)

    expect(sends()).toBe(1) // não retentou
  })

  it("número sem WhatsApp → WhatsAppNumberNotFoundError, sem POST de envio", async () => {
    let sendCalls = 0
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.includes("/api/contacts/check-exists")) {
        return jsonRes(200, { numberExists: false })
      }
      if (u.includes("/api/sendText")) {
        sendCalls++
        return jsonRes(200, { id: "x" })
      }
      throw new Error("unexpected")
    })

    await expect(
      sendTextMessage({ sessionName: "s1", toPhone: "+5511999999999", body: "oi" }),
    ).rejects.toBeInstanceOf(WhatsAppNumberNotFoundError)
    expect(sendCalls).toBe(0)
  })
})
