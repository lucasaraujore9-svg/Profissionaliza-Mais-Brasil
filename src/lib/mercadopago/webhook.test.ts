import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { validateMpWebhookSignature } from "./webhook"

function sign(dataId: string, requestId: string, ts: string, secret: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const hash = createHmac("sha256", secret).update(manifest).digest("hex")
  return `ts=${ts},v1=${hash}`
}

describe("validateMpWebhookSignature", () => {
  const secret = "mp-webhook-secret-de-teste"
  const dataId = "123456789"
  const requestId = "req-abc-123"
  // ts fresco (epoch em segundos) — anti-replay exige janela recente.
  const ts = String(Math.floor(Date.now() / 1000))

  it("aceita assinatura HMAC válida e recente", () => {
    const xSig = sign(dataId, requestId, ts, secret)
    expect(validateMpWebhookSignature(xSig, requestId, dataId, secret)).toBe(true)
  })

  it("aceita ts em milissegundos (13 dígitos)", () => {
    const tsMs = String(Date.now())
    const xSig = sign(dataId, requestId, tsMs, secret)
    expect(validateMpWebhookSignature(xSig, requestId, dataId, secret)).toBe(true)
  })

  it("rejeita replay: assinatura válida mas timestamp antigo (fora da janela)", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600) // 1h atrás
    const xSig = sign(dataId, requestId, oldTs, secret)
    expect(validateMpWebhookSignature(xSig, requestId, dataId, secret)).toBe(false)
  })

  it("rejeita hash forjado (assinado com outro secret)", () => {
    const xSig = sign(dataId, requestId, ts, "secret-do-atacante")
    expect(validateMpWebhookSignature(xSig, requestId, dataId, secret)).toBe(false)
  })

  it("rejeita quando dataId não bate com o assinado", () => {
    const xSig = sign(dataId, requestId, ts, secret)
    expect(validateMpWebhookSignature(xSig, requestId, "000", secret)).toBe(false)
  })

  it("rejeita headers ausentes", () => {
    expect(validateMpWebhookSignature(null, requestId, dataId, secret)).toBe(false)
    expect(validateMpWebhookSignature("ts=1,v1=ab", null, dataId, secret)).toBe(false)
    expect(validateMpWebhookSignature("ts=1,v1=ab", requestId, null, secret)).toBe(false)
  })

  it("rejeita x-signature malformado", () => {
    expect(validateMpWebhookSignature("lixo", requestId, dataId, secret)).toBe(false)
    expect(validateMpWebhookSignature("ts=1700000000", requestId, dataId, secret)).toBe(false)
  })
})
