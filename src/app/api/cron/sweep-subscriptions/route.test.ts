import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Fase 3 da varredura: assinatura ENCERRADA (o aluno cancelou) cujo período pago
 * acabou tem os cursos cortados. Antes ninguém cortava — as fases 1 e 2 só olham
 * ACTIVE/PAST_DUE — e os cursos ficavam abertos para sempre.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentSubscription: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock("@/lib/subscriptions/cancel", () => ({
  cancelSubscriptionAccess: vi.fn(),
  revokeEndedSubscriptionAccess: vi.fn(),
}))

// Fase 4 (pendente sem pagamento) tem teste próprio em abandoned.test.ts.
vi.mock("@/lib/subscriptions/abandoned", () => ({
  expireStalePendingSubscriptions: vi.fn(async () => ({ cancelled: 0, errors: [] })),
}))

import { prisma } from "@/lib/prisma"
import { revokeEndedSubscriptionAccess } from "@/lib/subscriptions/cancel"
import { POST } from "./route"

type Mock = ReturnType<typeof vi.fn>
const findMany = prisma.studentSubscription.findMany as unknown as Mock
const revokeEnded = revokeEndedSubscriptionAccess as unknown as Mock

const OLD_SECRET = process.env.CRON_SECRET

function run() {
  return POST(
    new Request("http://x/api/cron/sweep-subscriptions", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "test-secret"
})
afterEach(() => {
  process.env.CRON_SECRET = OLD_SECRET
})

describe("sweep-subscriptions · fase 3 (fim do período de assinatura cancelada)", () => {
  it("seleciona encerradas, recorrentes, com período vencido e matrícula viva", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await run()

    const where = findMany.mock.calls[1][0].where
    expect(where.status).toEqual({ in: ["CANCELLED", "EXPIRED"] })
    expect(where.interval).toEqual({ not: "LIFETIME" })
    expect(where.enrollments.some.status.in).toEqual(
      expect.arrayContaining(["ACTIVE", "COMPLETED"]),
    )
  })

  it("corta cada candidata e soma o resultado", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "sub_a" }, { id: "sub_b" }, { id: "sub_c" }])
    revokeEnded
      .mockResolvedValueOnce({ status: "done", adopted: 1, revoked: 2, enrollmentsCancelled: 2, errors: [] })
      .mockResolvedValueOnce({ status: "busy" })
      .mockResolvedValueOnce({ status: "done", adopted: 0, revoked: 0, enrollmentsCancelled: 0, errors: ["enrollment e9: 503"] })

    const res = await run()
    const body = await res.json()

    expect(revokeEnded).toHaveBeenCalledTimes(3)
    expect(body.data.endedAccessRevoked).toBe(2)
    expect(body.data.endedAccessAdopted).toBe(1)
    expect(body.data.errors).toEqual(["subscription sub_c: enrollment e9: 503"])
  })

  it("falha numa assinatura não derruba as outras", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "sub_a" }, { id: "sub_b" }])
    revokeEnded
      .mockRejectedValueOnce(new Error("db timeout"))
      .mockResolvedValueOnce({ status: "done", adopted: 0, revoked: 1, enrollmentsCancelled: 1, errors: [] })

    const body = await (await run()).json()
    expect(body.data.endedAccessRevoked).toBe(1)
    expect(body.data.errors[0]).toContain("sub_a")
  })
})
