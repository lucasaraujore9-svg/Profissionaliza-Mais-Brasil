import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHmac } from "node:crypto"
import { hashSync } from "bcryptjs"

const SECRET = "secret-1234567890"
vi.mock("@/lib/env", () => ({ env: { PMB_WEBHOOK_SECRET: "secret-1234567890" } }))
vi.mock("@/lib/ratelimit", () => ({
  RATE_LIMITS: { authLogin: {} },
  rateLimitByKey: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { student: { findMany: vi.fn() } } }))

import { prisma } from "@/lib/prisma"
import { POST } from "./route"

const findMany = prisma.student.findMany as unknown as ReturnType<typeof vi.fn>

function req(body: object, secret = SECRET) {
  const raw = JSON.stringify(body)
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")
  return new Request("http://x/api/lms/verificar-aluno", {
    method: "POST",
    headers: { "x-pmb-timestamp": ts, "x-pmb-signature": `sha256=${sig}` },
    body: raw,
  })
}

const hash = hashSync("senha-certa", 4)

beforeEach(() => {
  vi.clearAllMocks()
  findMany.mockResolvedValue([
    { id: "stu_a", passwordHash: hash },
    { id: "stu_b", passwordHash: hashSync("outra", 4) },
  ])
})

describe("POST /api/lms/verificar-aluno", () => {
  it("assinatura de outro segredo → 401, sem consultar aluno", async () => {
    const res = await POST(req({ email: "a@x.com", password: "senha-certa" }, "outro-segredo-123456"))
    expect(res.status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  it("devolve só as contas cuja senha confere", async () => {
    const res = await POST(req({ email: "A@X.com", password: "senha-certa" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ studentExternalIds: ["stu_a"] })
  })

  it("senha errada → lista vazia", async () => {
    const res = await POST(req({ email: "a@x.com", password: "errada" }))
    expect(await res.json()).toEqual({ studentExternalIds: [] })
  })

  it("mesma regra do login do PMB: exclui BLOQUEADO/INATIVO e sem senha", async () => {
    await POST(req({ email: "a@x.com", password: "senha-certa" }))
    const where = findMany.mock.calls[0][0].where
    expect(where.status).toEqual({ notIn: ["BLOQUEADO", "INATIVO"] })
    expect(where.passwordHash).toEqual({ not: null })
    expect(where.email).toEqual({ equals: "a@x.com", mode: "insensitive" })
  })
})
