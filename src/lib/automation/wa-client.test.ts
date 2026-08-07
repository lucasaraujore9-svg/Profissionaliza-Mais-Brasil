import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// API-008: sendTextMessage passa a retentar falhas TRANSITÓRIAS (5xx/rede) do
// engine, sem retentar 4xx. Config lida via @/lib/env (não process.env direto).
vi.mock("@/lib/env", () => ({
  env: { WA_GATEWAY_URL: "http://engine.local", WA_GATEWAY_API_KEY: "k" },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  ensureSessionWorking,
  sendTextMessage,
  WhatsAppNumberNotFoundError,
} from "./wa-client"

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

// A sessão cai sozinha no engine (restart do servidor, queda no celular) e o
// snapshot `waStatus` do banco continua dizendo WORKING. Era a 2ª maior causa de
// falha de disparo em produção: 16 registros de "Engine rejeitou envio (422):
// Session status is not as expected ... status: FAILED".
describe("wa-client — sessão caída no engine (422) é ressuscitada", () => {
  // Engine roteado por estado: `sessionState` controla o que /api/sessions/{n}
  // responde e o que /api/sendText aceita.
  function wireEngine(initialState: string) {
    const calls = { send: 0, start: 0, status: 0 }
    let sessionState = initialState

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)

      if (u.includes("/api/contacts/check-exists")) {
        return jsonRes(200, { numberExists: true, chatId: "5511999999999@c.us" })
      }
      if (u.includes("/api/sessions/start")) {
        calls.start++
        sessionState = "WORKING" // credenciais salvas → volta sozinha
        return jsonRes(200, { status: "WORKING" })
      }
      if (u.includes("/auth/qr")) {
        return jsonRes(200, { data: "x".repeat(120), mimetype: "image/png" })
      }
      if (u.includes("/api/sendText")) {
        calls.send++
        if (sessionState !== "WORKING") {
          return jsonRes(422, {
            error:
              "Session status is not as expected. Try again later or restart the session",
            status: sessionState,
            expected: ["WORKING"],
          })
        }
        return jsonRes(200, { id: "msg-ok" })
      }
      // GET /api/sessions/{name} — consulta de estado (depois de start/stop).
      if (u.includes("/api/sessions/")) {
        calls.status++
        return jsonRes(200, {
          status: sessionState,
          me: { phone: "5511888888888" },
        })
      }
      throw new Error(`unexpected url ${u}`)
    })

    return calls
  }

  it("422 de sessão caída → religa a sessão e reenvia (entrega)", async () => {
    const calls = wireEngine("FAILED")

    const out = await sendTextMessage({
      sessionName: "s1",
      toPhone: "+5511999999999",
      body: "oi",
    })

    expect(out.engineMessageId).toBe("msg-ok")
    expect(calls.start).toBe(1) // ressuscitou
    expect(calls.send).toBe(2) // 1 recusado + 1 depois de religar
  })

  it("ensureSessionWorking devolve WORKING após reiniciar sessão caída", async () => {
    const calls = wireEngine("DISCONNECTED")

    const live = await ensureSessionWorking("s1")

    expect(live.status).toBe("WORKING")
    expect(calls.start).toBe(1)
  })

  it("SCAN_QR_CODE não é ressuscitável — não tenta reiniciar", async () => {
    // Credenciais perdidas: só o dono resolve, escaneando o QR. Reiniciar aqui
    // só geraria carga inútil no engine.
    const calls = wireEngine("SCAN_QR_CODE")

    const live = await ensureSessionWorking("s1")

    expect(live.status).toBe("SCAN_QR_CODE")
    expect(calls.start).toBe(0)
  })
})
