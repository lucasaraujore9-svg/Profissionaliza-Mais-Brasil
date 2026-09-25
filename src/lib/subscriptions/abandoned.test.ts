import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { studentSubscription: { findMany: vi.fn(), deleteMany: vi.fn() } },
}))
vi.mock("./cancel", () => ({ cancelSubscriptionAccess: vi.fn(async () => ({})) }))

import { prisma } from "@/lib/prisma"
import { cancelSubscriptionAccess } from "./cancel"
import { discardAbandonedCheckouts, expireStalePendingSubscriptions } from "./abandoned"

const findMany = prisma.studentSubscription.findMany as unknown as ReturnType<typeof vi.fn>
const deleteMany = prisma.studentSubscription.deleteMany as unknown as ReturnType<typeof vi.fn>
const cancel = cancelSubscriptionAccess as unknown as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe("discardAbandonedCheckouts", () => {
  it("apaga só o que nunca chegou ao gateway e cancela lá o que chegou", async () => {
    findMany.mockResolvedValue([
      { id: "sem_gateway", externalReference: null },
      { id: "com_pix", externalReference: "pmb_sub_com_pix" },
    ])

    await discardAbandonedCheckouts("st1", "t1", new Date())

    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: ["sem_gateway"] }, externalReference: null }),
    })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith("com_pix", "REQUESTED", false)
  })

  it("nunca alcança venda direta nem assinatura já paga", async () => {
    findMany.mockResolvedValue([])
    await discardAbandonedCheckouts("st1", "t1", new Date())
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          soldByUserId: null,
          status: "PENDING",
          payments: { none: { paidAt: { not: null } } },
        }),
      }),
    )
  })
})

describe("expireStalePendingSubscriptions", () => {
  it("cancela (sem apagar) a pendente antiga, e segue se uma falhar", async () => {
    findMany.mockResolvedValue([
      { id: "a", externalReference: "pmb_sub_a" },
      { id: "b", externalReference: null },
    ])
    cancel.mockRejectedValueOnce(new Error("asaas fora"))

    const r = await expireStalePendingSubscriptions(new Date("2026-10-10"))

    expect(deleteMany).not.toHaveBeenCalled()
    expect(r.cancelled).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: new Date("2026-10-03") } }),
      }),
    )
  })
})
