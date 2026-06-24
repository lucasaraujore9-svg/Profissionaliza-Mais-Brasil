import { describe, it, expect } from "vitest"
import pino from "pino"
import { Writable } from "node:stream"
import { REDACT_PATHS } from "./logger"

const CENSOR = "[REDACTED]"

/**
 * Constrói um logger Pino com EXATAMENTE a mesma allowlist de redação
 * (`REDACT_PATHS`) usada em produção, escrevendo para um buffer em memória.
 * Assim provamos o comportamento real de censura sem depender de stdout.
 */
function captureLog(obj: Record<string, unknown>): Record<string, unknown> {
  const chunks: string[] = []
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString())
      cb()
    },
  })
  const log = pino(
    {
      level: "info",
      redact: { paths: [...REDACT_PATHS], censor: CENSOR },
    },
    sink,
  )
  log.info(obj, "test")
  return JSON.parse(chunks.join("")) as Record<string, unknown>
}

describe("logger REDACT_PATHS", () => {
  it("redige e-mail, telefone e senha no nível raiz (LGPD-010)", () => {
    const out = captureLog({
      email: "aluno@exemplo.com",
      telefone: "11999998888",
      senha: "segredo123",
    })
    expect(out.email).toBe(CENSOR)
    expect(out.telefone).toBe(CENSOR)
    expect(out.senha).toBe(CENSOR)
  })

  it("redige variações de campo de contato (fone/fone2/phone)", () => {
    const out = captureLog({
      fone: "1133334444",
      fone2: "11955554444",
      phone: "+5511999990000",
    })
    expect(out.fone).toBe(CENSOR)
    expect(out.fone2).toBe(CENSOR)
    expect(out.phone).toBe(CENSOR)
  })

  it("redige senhas de plataforma cifradas (lmsSenha/plataformaAlunoSenha)", () => {
    const out = captureLog({
      lmsSenha: "ciphertext-lms",
      plataformaAlunoSenha: "ciphertext-ea",
    })
    expect(out.lmsSenha).toBe(CENSOR)
    expect(out.plataformaAlunoSenha).toBe(CENSOR)
  })

  it("redige PII aninhada em um objeto Student (*.email, *.telefone, *.senha)", () => {
    const out = captureLog({
      student: {
        nome: "Fulano",
        email: "fulano@exemplo.com",
        telefone: "11988887777",
        senha: "x",
        lmsSenha: "y",
      },
    })
    const student = out.student as Record<string, unknown>
    expect(student.email).toBe(CENSOR)
    expect(student.telefone).toBe(CENSOR)
    expect(student.senha).toBe(CENSOR)
    expect(student.lmsSenha).toBe(CENSOR)
    // campos não-sensíveis permanecem
    expect(student.nome).toBe("Fulano")
  })

  it("mantém intactos os já cobertos (cpf, password) — sem regressão", () => {
    const out = captureLog({ cpf: "12345678900", password: "p", action: "x" })
    expect(out.cpf).toBe(CENSOR)
    expect(out.password).toBe(CENSOR)
    expect(out.action).toBe("x")
  })
})
