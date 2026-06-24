import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { validateLmsWebhookSignature, lmsDedupKey } from "./lms-webhook"

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

describe("lmsDedupKey (idempotência — API-006)", () => {
  it("usa o X-PMB-Event-Id quando presente (trim)", () => {
    expect(lmsDedupKey("evt_123", "course.completed", BODY)).toBe("evt_123")
    expect(lmsDedupKey("  evt_123  ", "course.completed", BODY)).toBe("evt_123")
  })

  it("sem header: deriva hash determinístico do conteúdo (mesmo conteúdo → mesma chave)", () => {
    const a = lmsDedupKey(null, "student.question.created", BODY)
    const b = lmsDedupKey(undefined, "student.question.created", BODY)
    const c = lmsDedupKey("", "student.question.created", BODY)
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it("sem header: conteúdo ou tipo diferentes → chave diferente (não colide)", () => {
    const base = lmsDedupKey(null, "student.question.created", BODY)
    expect(lmsDedupKey(null, "student.question.created", BODY + "x")).not.toBe(base)
    expect(lmsDedupKey(null, "course.completed", BODY)).not.toBe(base)
  })
})
