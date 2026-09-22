import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: { enrollment: { findMany: vi.fn() } } }))
vi.mock("@/lib/mercadopago/process", () => ({ reconcilePendingEnrollment: vi.fn() }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ warn: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import { reconcilePendingEnrollment } from "@/lib/mercadopago/process"
import { reconcilePendingSales } from "./reconcile-sweep"

const findMany = prisma.enrollment.findMany as unknown as ReturnType<typeof vi.fn>
const reconcile = reconcilePendingEnrollment as unknown as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe("reconcilePendingSales", () => {
  it("só varre PENDENTE dos dois gateways, sem satélite, nos últimos 30 dias", async () => {
    findMany.mockResolvedValue([])
    const now = new Date("2026-09-22T12:00:00Z")
    await reconcilePendingSales(now)
    const where = findMany.mock.calls[0][0].where
    expect(where.status).toBe("PENDING")
    expect(where.gateway).toEqual({ in: ["MP", "ASAAS"] })
    expect(where.primaryEnrollmentId).toBeNull()
    expect(where.createdAt.gte).toEqual(new Date("2026-08-23T12:00:00Z"))
  })

  it("libera as pagas e um erro não interrompe as demais", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }])
    reconcile
      .mockRejectedValueOnce(new Error("MP 500"))
      .mockResolvedValueOnce({ status: "confirmed" })
      .mockResolvedValueOnce({ status: "pending" })

    const r = await reconcilePendingSales()

    expect(reconcile).toHaveBeenCalledTimes(3)
    expect(r.confirmed).toEqual(["b"])
    expect(r.pending).toBe(1)
    expect(r.errors).toEqual(["a: MP 500"])
  })
})
