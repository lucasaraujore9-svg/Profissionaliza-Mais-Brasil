import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { validateLmsWebhookSignature } from "./lms-webhook"

const SECRET = "test-secret-1234567890"
const BODY = '{"studentExternalId":"stu_1","courseId":"c1"}'

function nowSec(): string {
  return String(Math.floor(Date.now() / 1000))
}

function sign(timestamp: string, rawBody: string, secret = SECRET): string {
  return (
    "sha256=" +
    createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
  )
}

describe("validateLmsWebhookSignature", () => {
  it("aceita uma assinatura válida (header sha256=...)", () => {
    const ts = nowSec()
    expect(validateLmsWebhookSignature(ts, BODY, sign(ts, BODY), SECRET)).toBe(true)
  })

  it("aceita hex puro (sem o prefixo sha256=)", () => {
    const ts = nowSec()
    const hex = sign(ts, BODY).slice("sha256=".length)
    expect(validateLmsWebhookSignature(ts, BODY, hex, SECRET)).toBe(true)
  })

  it("rejeita segredo errado", () => {
    const ts = nowSec()
    expect(
      validateLmsWebhookSignature(ts, BODY, sign(ts, BODY, "outro-segredo"), SECRET),
    ).toBe(false)
  })

  it("rejeita corpo adulterado", () => {
    const ts = nowSec()
    const validSig = sign(ts, BODY)
    expect(validateLmsWebhookSignature(ts, BODY, validSig, SECRET)).toBe(true)
    expect(
      validateLmsWebhookSignature(ts, BODY + "x", validSig, SECRET),
    ).toBe(false)
  })

  it("rejeita timestamp fora da janela anti-replay", () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600) // 1h atrás
    expect(validateLmsWebhookSignature(old, BODY, sign(old, BODY), SECRET)).toBe(false)
  })

  it("rejeita headers ausentes ou assinatura não-hex", () => {
    const ts = nowSec()
    expect(validateLmsWebhookSignature(null, BODY, sign(ts, BODY), SECRET)).toBe(false)
    expect(validateLmsWebhookSignature(ts, BODY, null, SECRET)).toBe(false)
    expect(validateLmsWebhookSignature(ts, BODY, "sha256=zzz", SECRET)).toBe(false)
  })
})
