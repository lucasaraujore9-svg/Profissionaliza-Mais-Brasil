import { describe, it, expect } from "vitest"
import { describeEmailError, EmailError } from "./mailer"

/**
 * O caso real de 24/08/2026: a senha da caixa `nao-responda` foi trocada, o
 * SMTP passou a responder 535 e `sendEmail` embrulhou isso num `EmailError`
 * genérico. `EmailLog` guardava só a mensagem do wrapper, então 63 falhas
 * seguidas gravaram a MESMA linha muda e o diagnóstico teve que ser refeito
 * reproduzindo o envio à mão.
 */
function nodemailerAuthError(): Error {
  return Object.assign(
    new Error("Invalid login: 535 5.7.8 Error: authentication failed"),
    { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" },
  )
}

describe("describeEmailError", () => {
  it("preserva a resposta do servidor que estava só no `cause`", () => {
    const logged = describeEmailError(
      new EmailError("Falha ao enviar email via SMTP", nodemailerAuthError()),
    )

    expect(logged).toContain("Falha ao enviar email via SMTP")
    // A parte acionável: sem ela, o log não distingue senha errada de queda.
    expect(logged).toContain("535 5.7.8")
    expect(logged).toContain("EAUTH")
    expect(logged).toContain("AUTH PLAIN")
  })

  it("distingue timeout de falha de autenticação", () => {
    const timeout = Object.assign(new Error("Connection timeout"), {
      code: "ETIMEDOUT",
      command: "CONN",
    })
    const logged = describeEmailError(
      new EmailError("Falha ao enviar email via SMTP", timeout),
    )

    expect(logged).toContain("ETIMEDOUT")
    expect(logged).not.toContain("EAUTH")
  })

  it("lê o formato do Resend, que devolve objeto puro e não Error", () => {
    const logged = describeEmailError(
      new EmailError("Resend error: domain not verified", {
        name: "validation_error",
        message: "domain not verified",
      }),
    )

    expect(logged).toContain("Resend error: domain not verified")
    expect(logged).toContain("domain not verified")
  })

  it("não trava numa cadeia de `cause` cíclica", () => {
    const a = new Error("a") as Error & { cause?: unknown }
    const b = new Error("b") as Error & { cause?: unknown }
    a.cause = b
    b.cause = a

    expect(describeEmailError(a)).toBe("a | causa: b")
  })

  it("trunca cadeia longa em vez de despejar stack inteira na coluna", () => {
    const logged = describeEmailError(new Error("x".repeat(5000)))

    expect(logged!.length).toBeLessThanOrEqual(2001)
    expect(logged!.endsWith("…")).toBe(true)
  })

  it("devolve null quando não houve erro (linha SENT)", () => {
    expect(describeEmailError(undefined)).toBeNull()
    expect(describeEmailError(null)).toBeNull()
  })
})
