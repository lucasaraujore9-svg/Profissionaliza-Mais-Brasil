import { describe, it, expect, vi, beforeEach } from "vitest"

const sendMail = vi.fn()
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}))
vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => `plain:${v}` }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    smtpAccount: { updateMany: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import {
  sendViaSmtpPool,
  sentToday,
  shouldAlert,
  withSenderAddress,
} from "./smtp-pool"

const p = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>
  $executeRaw: ReturnType<typeof vi.fn>
}

function account(id: string, sentCount = 1) {
  return {
    id,
    email: `${id}@pmb.com.br`,
    passwordEnc: "enc",
    host: "smtp.hostinger.com",
    port: 465,
    dailyLimit: 100,
    sentCount,
    alertedDay: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.$executeRaw.mockResolvedValue(1)
})

describe("regras puras", () => {
  it("contador de outro dia vale zero (virada sem cron)", () => {
    expect(sentToday({ sentDay: "2026-09-21", sentCount: 99 }, "2026-09-22")).toBe(0)
    expect(sentToday({ sentDay: "2026-09-22", sentCount: 42 }, "2026-09-22")).toBe(42)
  })

  it("alerta a partir de 80% e só uma vez por dia", () => {
    const base = { dailyLimit: 100, alertedDay: null }
    expect(shouldAlert({ ...base, sentCount: 79 }, "d")).toBe(false)
    expect(shouldAlert({ ...base, sentCount: 80 }, "d")).toBe(true)
    expect(shouldAlert({ ...base, sentCount: 95, alertedDay: "d" }, "d")).toBe(false)
  })

  it("remetente vira a caixa que envia, preservando o nome da unidade", () => {
    expect(withSenderAddress("Loja X <nao-responda@pmb.com.br>", "noreply@pmb.com.br")).toBe(
      "Loja X <noreply@pmb.com.br>",
    )
    expect(withSenderAddress(undefined, "a@pmb.com.br")).toBe(
      "Profissionaliza Mais Brasil <a@pmb.com.br>",
    )
  })
})

describe("sendViaSmtpPool", () => {
  it("sem caixa com vaga → null (cai no SMTP das variáveis)", async () => {
    p.$queryRaw.mockResolvedValue([])
    expect(await sendViaSmtpPool({ to: "x@y.com", subject: "s", html: "h" })).toBeNull()
  })

  it("caixa que falha devolve a vaga e o envio segue pela próxima", async () => {
    p.$queryRaw.mockResolvedValueOnce([account("a")]).mockResolvedValueOnce([account("b")])
    sendMail
      .mockRejectedValueOnce(Object.assign(new Error("535 auth"), { code: "EAUTH" }))
      .mockResolvedValueOnce({ messageId: "m1" })

    const result = await sendViaSmtpPool({ to: "x@y.com", subject: "s", html: "h" })

    expect(result).toEqual({ messageId: "m1", account: "b@pmb.com.br" })
    expect(p.$executeRaw).toHaveBeenCalledTimes(1) // release da caixa "a"
    expect(sendMail.mock.calls[1][0].from).toContain("<b@pmb.com.br>")
  })

  it("destinatário recusado NÃO gasta vaga das outras caixas", async () => {
    p.$queryRaw.mockResolvedValue([account("a")])
    sendMail.mockRejectedValueOnce(Object.assign(new Error("550"), { code: "EENVELOPE" }))

    await expect(sendViaSmtpPool({ to: "x@y.com", subject: "s", html: "h" })).rejects.toThrow("550")
    expect(p.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it("todas as caixas falharam → lança o último erro (não finge sucesso)", async () => {
    p.$queryRaw.mockResolvedValueOnce([account("a")]).mockResolvedValueOnce([])
    sendMail.mockRejectedValueOnce(new Error("timeout"))

    await expect(sendViaSmtpPool({ to: "x@y.com", subject: "s", html: "h" })).rejects.toThrow("timeout")
  })

  it("falha do banco na reserva → null, sem apagão de e-mail", async () => {
    p.$queryRaw.mockRejectedValue(new Error("relation smtp_accounts does not exist"))
    expect(await sendViaSmtpPool({ to: "x@y.com", subject: "s", html: "h" })).toBeNull()
  })
})
