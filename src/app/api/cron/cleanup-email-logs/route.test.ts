import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// DB-008: mecanismo de retenção de email_logs. Testa o gate de auth e a purga.
vi.mock("@/lib/prisma", () => ({
  prisma: { emailLog: { deleteMany: vi.fn() } },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { POST } from "./route"

const deleteMany = (prisma as unknown as {
  emailLog: { deleteMany: ReturnType<typeof vi.fn> }
}).emailLog.deleteMany

const OLD_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  deleteMany.mockReset()
  process.env.CRON_SECRET = "test-secret"
})
afterEach(() => {
  process.env.CRON_SECRET = OLD_SECRET
})

describe("cleanup-email-logs — mecanismo de retenção (DB-008)", () => {
  it("rejeita sem cron secret (401) e NÃO apaga nada", async () => {
    const res = await POST(new Request("http://x/api/cron/cleanup-email-logs", { method: "POST" }))
    expect(res.status).toBe(401)
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("autorizado: apaga por createdAt < cutoff e retorna a contagem", async () => {
    deleteMany.mockResolvedValue({ count: 7 })
    const res = await POST(
      new Request("http://x/api/cron/cleanup-email-logs", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(7)

    expect(deleteMany).toHaveBeenCalledTimes(1)
    const arg = deleteMany.mock.calls[0][0]
    expect(arg.where.createdAt.lt).toBeInstanceOf(Date)
    // cutoff no passado (retenção positiva).
    expect((arg.where.createdAt.lt as Date).getTime()).toBeLessThan(Date.now())
  })
})
