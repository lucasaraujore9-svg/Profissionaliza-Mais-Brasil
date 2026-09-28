import { describe, it, expect, vi, beforeEach } from "vitest"

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  student: { findFirst: vi.fn() },
  enrollment: { findFirst: vi.fn() },
}))
const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }))
const link = vi.hoisted(() => ({ sendPasswordLink: vi.fn() }))

vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("./mailer", () => mail)
vi.mock("@/lib/auth/password-link", () => link)
vi.mock("./tenant-brand", () => ({
  loadTenantEmailBrand: vi.fn(async () => ({ name: "Loja", siteUrl: "https://loja.test" })),
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { contextLogger: () => noop }
})

import {
  RECOVERY_LINK_MINUTES,
  courseNameFromSubject,
  recoverLostEmails,
} from "./recovery"
import { expirationLabel } from "./templates/reset-password"

const failedAt = new Date("2026-09-26T10:00:00Z")
const access = (email: string) => ({ email, tenantId: null, firstFailed: failedAt })
const enroll = (email: string) => ({
  email,
  subject: "Matrícula confirmada em Barbeiro",
  tenantId: "t1",
  firstFailed: failedAt,
})

function candidates(a: unknown[], e: unknown[]) {
  db.$queryRaw.mockResolvedValueOnce(a).mockResolvedValueOnce(e)
}

beforeEach(() => {
  vi.clearAllMocks()
  db.student.findFirst.mockImplementation(async ({ where }: { where: { email: { equals: string } } }) => ({
    id: `s_${where.email.equals}`,
    nome: "Aluno",
    email: where.email.equals,
    tenantId: "t9",
    lastLoginAt: null,
  }))
  db.enrollment.findFirst.mockResolvedValue({ id: "e1" })
  link.sendPasswordLink.mockResolvedValue(true)
  mail.sendEmail.mockResolvedValue({ id: "m" })
})

describe("recoverLostEmails", () => {
  it("dry-run não envia nada e respeita o limite", async () => {
    candidates([access("a@x.com"), access("b@x.com")], [enroll("c@x.com")])
    const r = await recoverLostEmails({ apply: false, limit: 2, spacingMs: 0 })

    expect(r.outcomes.map((o) => o.result)).toEqual(["would_send", "would_send"])
    expect(link.sendPasswordLink).not.toHaveBeenCalled()
    expect(mail.sendEmail).not.toHaveBeenCalled()
  })

  it("link de acesso: 72h, texto de recuperação e a loja da conta encontrada", async () => {
    candidates([access("a@x.com")], [])
    await recoverLostEmails({ apply: true, limit: 5, spacingMs: 0 })

    // Nunca troca senha: só manda o link, na loja da conta (log sem unidade).
    expect(link.sendPasswordLink).toHaveBeenCalledWith("a@x.com", {
      expirationMinutes: RECOVERY_LINK_MINUTES,
      recovery: true,
      tenantId: "t9",
    })
  })

  it("quem já entrou depois da falha não recebe link", async () => {
    candidates([access("a@x.com")], [])
    db.student.findFirst.mockResolvedValueOnce({
      id: "s1", nome: "A", email: "a@x.com", tenantId: "t9",
      lastLoginAt: new Date("2026-09-27T00:00:00Z"),
    })
    const r = await recoverLostEmails({ apply: true, limit: 5, spacingMs: 0 })

    expect(r.outcomes[0]).toMatchObject({ result: "skipped", reason: "ja_entrou" })
    expect(link.sendPasswordLink).not.toHaveBeenCalled()
  })

  it("para no primeiro envio que falhar (provedor recusando de novo)", async () => {
    candidates([access("a@x.com"), access("b@x.com")], [enroll("c@x.com")])
    link.sendPasswordLink.mockRejectedValueOnce(new Error("554 5.7.1"))
    const r = await recoverLostEmails({ apply: true, limit: 5, spacingMs: 0 })

    expect(link.sendPasswordLink).toHaveBeenCalledTimes(1)
    expect(mail.sendEmail).not.toHaveBeenCalled()
    expect(r.outcomes.at(-1)).toMatchObject({ result: "failed" })
  })

  it("matrícula cancelada não recebe 'matrícula confirmada' atrasado", async () => {
    candidates([], [enroll("c@x.com")])
    db.enrollment.findFirst.mockResolvedValueOnce(null)
    const r = await recoverLostEmails({ apply: true, limit: 5, spacingMs: 0 })

    expect(r.outcomes[0]).toMatchObject({ result: "skipped", reason: "matricula_nao_ativa" })
    expect(mail.sendEmail).not.toHaveBeenCalled()
  })

  it("matrícula ativa: refaz com o MESMO assunto (é o que torna a lista idempotente)", async () => {
    candidates([], [enroll("c@x.com")])
    await recoverLostEmails({ apply: true, limit: 5, spacingMs: 0 })

    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "c@x.com",
        subject: "Matrícula confirmada em Barbeiro",
        tenantId: "t1",
        template: expect.objectContaining({
          type: "enrollment",
          props: expect.objectContaining({ courseName: "Barbeiro", school: null, isNewStudent: true }),
        }),
      }),
    )
  })
})

describe("regras puras", () => {
  it("curso sai do assunto original", () => {
    expect(courseNameFromSubject("Novo curso liberado: Excel")).toEqual({ course: "Excel", isNew: false })
    expect(courseNameFromSubject("Outro assunto")).toBeNull()
  })

  it("validade longa aparece em horas", () => {
    expect(expirationLabel(5)).toBe("5 minutos")
    expect(expirationLabel(72 * 60)).toBe("72 horas")
  })
})
