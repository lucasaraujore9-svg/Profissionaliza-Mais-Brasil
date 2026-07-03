import { describe, it, expect } from "vitest"
import { redactWebhookPayload } from "./redact-payload"

describe("redactWebhookPayload (OBS-008 / LGPD-014)", () => {
  it("mascara CPF/e-mail/telefone do customer do Asaas mantendo ids/status/valores", () => {
    const asaas = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_123",
        status: "RECEIVED",
        value: 209.9,
        customer: {
          id: "cus_1",
          name: "Fulano",
          cpfCnpj: "12345678900",
          email: "fulano@example.com",
          phone: "1133334444",
          mobilePhone: "11999998888",
        },
      },
    }

    const out = redactWebhookPayload(asaas) as typeof asaas

    // Preserva o suficiente para debug.
    expect(out.event).toBe("PAYMENT_RECEIVED")
    expect(out.payment.id).toBe("pay_123")
    expect(out.payment.status).toBe("RECEIVED")
    expect(out.payment.value).toBe(209.9)
    expect(out.payment.customer.id).toBe("cus_1")

    // Mascara PII.
    expect(out.payment.customer.cpfCnpj).toBe("[REDACTED]")
    expect(out.payment.customer.email).toBe("[REDACTED]")
    expect(out.payment.customer.phone).toBe("[REDACTED]")
    expect(out.payment.customer.mobilePhone).toBe("[REDACTED]")
  })

  it("substitui texto livre (body da dúvida do aluno LMS) por marcador de tamanho", () => {
    const lms = {
      event: "student.question.created",
      studentId: "stu_1",
      body: "Olá, meu CPF é 123.456.789-00 e meu telefone é 11 99999-8888, preciso de ajuda",
    }

    const out = redactWebhookPayload(lms) as { event: string; studentId: string; body: string }

    expect(out.event).toBe("student.question.created")
    expect(out.studentId).toBe("stu_1")
    expect(out.body).toBe(`[REDACTED:free-text len=${lms.body.length}]`)
    expect(out.body).not.toContain("123.456.789-00")
  })

  it("é case-insensitive nas chaves e desce em arrays", () => {
    const payload = {
      items: [
        { Email: "a@b.com", CPF: "111" },
        { telefone: "999", ok: 1 },
      ],
    }
    const out = redactWebhookPayload(payload) as {
      items: Array<Record<string, unknown>>
    }
    expect(out.items[0].Email).toBe("[REDACTED]")
    expect(out.items[0].CPF).toBe("[REDACTED]")
    expect(out.items[1].telefone).toBe("[REDACTED]")
    expect(out.items[1].ok).toBe(1)
  })

  it("não altera primitivos nem objetos sem PII", () => {
    expect(redactWebhookPayload("x")).toBe("x")
    expect(redactWebhookPayload(42)).toBe(42)
    expect(redactWebhookPayload(null)).toBe(null)
    expect(redactWebhookPayload({ type: "payment", id: "1" })).toEqual({ type: "payment", id: "1" })
  })
})
