import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-005: o cron passou a processar um LOTE capado por execução com cursor
// keyset (id) no Redis — retoma de onde parou e zera ao varrer a última página.
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findMany: vi.fn() } } }))
vi.mock("@/lib/redis/cache", () => ({ get: vi.fn(), set: vi.fn(), invalidate: vi.fn() }))
vi.mock("@/lib/asaas/reconcile", () => ({ reconcileTenantPayments: vi.fn() }))
// O batimento do cron tem suite propria (cron-heartbeat.test.ts); aqui so
// precisamos passar pela autorizacao.
vi.mock("@/lib/observability/cron-heartbeat", () => ({
  authorizeCron: vi.fn(async () => true),
}))
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import { get as redisGet, set as redisSet, invalidate as redisDel } from "@/lib/redis/cache"
import { reconcileTenantPayments } from "@/lib/asaas/reconcile"
import { POST } from "./route"

const findMany = (prisma as unknown as { tenant: { findMany: ReturnType<typeof vi.fn> } }).tenant.findMany
const getMock = redisGet as unknown as ReturnType<typeof vi.fn>
const setMock = redisSet as unknown as ReturnType<typeof vi.fn>
const delMock = redisDel as unknown as ReturnType<typeof vi.fn>
const reconcileMock = reconcileTenantPayments as unknown as ReturnType<typeof vi.fn>

const CURSOR_KEY = "cron:reconcile-tenant-payments:cursor"

beforeEach(() => {
  vi.clearAllMocks()
  reconcileMock.mockResolvedValue({ markedDeleted: 0, skipped: false })
})

function req() {
  return new Request("http://x/api/cron/reconcile-tenant-payments", { method: "POST" })
}

describe("reconcile-tenant-payments — cursor keyset (PERF-005)", () => {
  it("lê o cursor e o injeta no where; lote cheio (300) avança o cursor", async () => {
    getMock.mockResolvedValue("t-prev")
    // Lote cheio: 300 tenants.
    const tenants = Array.from({ length: 300 }, (_, i) => ({
      id: `t${String(i).padStart(3, "0")}`,
      slug: `s${i}`,
      asaasCustomerId: "c",
      asaasSubscriptionId: null,
    }))
    findMany.mockResolvedValue(tenants)

    await POST(req())

    const arg = findMany.mock.calls[0][0]
    expect(arg.take).toBe(300)
    expect(arg.where.id).toEqual({ gt: "t-prev" })
    expect(arg.orderBy).toEqual({ id: "asc" })
    // Avança para o último id do lote.
    expect(setMock).toHaveBeenCalledWith(CURSOR_KEY, "t299", expect.any(Number))
    expect(delMock).not.toHaveBeenCalled()
  })

  it("lote parcial (fim da lista) zera o cursor", async () => {
    getMock.mockResolvedValue(null)
    findMany.mockResolvedValue([
      { id: "t1", slug: "s1", asaasCustomerId: "c", asaasSubscriptionId: null },
    ])

    await POST(req())

    const arg = findMany.mock.calls[0][0]
    // Sem cursor: where.id não é injetado.
    expect(arg.where.id).toBeUndefined()
    expect(delMock).toHaveBeenCalledWith(CURSOR_KEY)
    expect(setMock).not.toHaveBeenCalled()
  })
})
