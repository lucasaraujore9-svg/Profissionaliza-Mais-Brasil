import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Apagão de 25/09/2026: a Hostinger suspendeu as 5 caixas (554 5.7.1) e o pool
 * LANÇAVA — `sendEmail` desistia sem tentar SMTP_* nem Resend, que só entravam
 * quando o pool não tinha vaga. 285 e-mails perdidos em 3 dias.
 */

const suspended = Object.assign(
  new Error("Message failed: 554 5.7.1 Outbound sending is disabled for this account"),
  { responseCode: 554 },
)

const pool = vi.hoisted(() => ({ sendViaSmtpPool: vi.fn() }))
const smtp = vi.hoisted(() => ({ sendSmtp: vi.fn(), getDefaultFrom: () => "PMB <n@pmb.test>" }))
const emailLog = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("./smtp-pool", () => pool)
vi.mock("./smtp", () => smtp)
vi.mock("@/lib/prisma", () => ({ prisma: { emailLog } }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { sendEmail } from "./mailer"

const msg = {
  to: "aluno@x.com",
  subject: "Bem-vindo",
  template: {
    type: "notification" as const,
    props: { title: "t", body: "b" },
  },
}

const ENV = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(process.env, {
    SMTP_HOST: "email-smtp.sa-east-1.amazonaws.com",
    SMTP_USER: "u",
    SMTP_PASSWORD: "p",
    SMTP_PORT: "587",
  })
  delete process.env.RESEND_API_KEY
})
afterEach(() => {
  process.env = { ...ENV }
})

describe("sendEmail — fallback quando as caixas do pool falham", () => {
  it("caixas suspensas: entrega pelo SMTP das variáveis de ambiente", async () => {
    pool.sendViaSmtpPool.mockRejectedValue(suspended)
    smtp.sendSmtp.mockResolvedValue({ messageId: "ses-1" })

    await expect(sendEmail(msg)).resolves.toEqual({ id: "ses-1" })
    expect(emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "SENT", provider: "smtp" }),
    })
  })

  it("destinatário recusado NÃO troca de provedor (a recusa seria a mesma)", async () => {
    pool.sendViaSmtpPool.mockRejectedValue(Object.assign(new Error("refused"), { code: "EENVELOPE" }))

    await expect(sendEmail(msg)).rejects.toThrow()
    expect(smtp.sendSmtp).not.toHaveBeenCalled()
  })

  it("sem provedor de fallback, o erro do pool sobe", async () => {
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PORT"]) delete process.env[k]
    pool.sendViaSmtpPool.mockRejectedValue(suspended)

    await expect(sendEmail(msg)).rejects.toThrow("caixas cadastradas")
  })
})
