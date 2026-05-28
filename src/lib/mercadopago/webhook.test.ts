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
  const ts = "1700000000"

  it("aceita assinatura HMAC válida", () => {
    const xSig = sign(dataId, requestId, ts, secret)
    expect(validateMpWebhookSignature(xSig, requestId, dataId, secret)).toBe(true)
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
