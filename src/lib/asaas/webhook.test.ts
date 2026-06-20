import { describe, it, expect, afterEach } from "vitest"
import { validateAsaasWebhook, parseAsaasWebhookPayload } from "./webhook"

const ORIG = process.env.ASAAS_WEBHOOK_TOKEN
afterEach(() => {
  if (ORIG === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN
  else process.env.ASAAS_WEBHOOK_TOKEN = ORIG
})

describe("validateAsaasWebhook (QA-002)", () => {
  const TOKEN = "tok_super_secreto_123456"

  it("aceita o token correto", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook(TOKEN)).toBe(true)
  })
  it("rejeita token errado de mesmo comprimento", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook("tok_errado_0000000000000")).toBe(false)
  })
  it("rejeita token de comprimento diferente", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook("curto")).toBe(false)
  })
  it("rejeita header ausente", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook(null)).toBe(false)
  })
  it("rejeita quando ASAAS_WEBHOOK_TOKEN está ausente (regressão do dev-bypass)", () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN
    expect(validateAsaasWebhook("qualquer")).toBe(false)
  })
})

describe("parseAsaasWebhookPayload (QA-002)", () => {
  it("aceita PAYMENT_RECEIVED válido e preserva campos extras (passthrough)", () => {
    const body = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_1",
        value: 209,
        status: "RECEIVED",
        dueDate: "2026-06-20",
        campoNovo: "preservado",
      },
    }
    const out = parseAsaasWebhookPayload(body)
    expect(out.event).toBe("PAYMENT_RECEIVED")
    expect((out.payment as unknown as Record<string, unknown>).campoNovo).toBe(
      "preservado",
    )
  })
  it("aceita evento só com subscription", () => {
    const out = parseAsaasWebhookPayload({
      event: "SUBSCRIPTION_UPDATED",
      subscription: { id: "sub_1" },
    })
    expect(out.event).toBe("SUBSCRIPTION_UPDATED")
  })
  it("rejeita corpo sem payment nem subscription", () => {
    expect(() => parseAsaasWebhookPayload({ event: "PING" })).toThrow()
  })
  it("rejeita payment sem value", () => {
    expect(() =>
      parseAsaasWebhookPayload({
        event: "PAYMENT_RECEIVED",
        payment: { id: "p", status: "RECEIVED", dueDate: "2026-06-20" },
      }),
    ).toThrow()
  })
  it("rejeita corpo não-objeto", () => {
    expect(() => parseAsaasWebhookPayload(null)).toThrow()
  })
})
