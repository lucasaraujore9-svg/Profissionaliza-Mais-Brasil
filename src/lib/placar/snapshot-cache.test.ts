import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-011: os streams SSE recomputavam o snapshot por CONEXÃO a cada tick.
// Os wrappers *Cached compartilham via Redis (TTL 5s): HIT não toca o Postgres.
vi.mock("@/lib/redis/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: vi.fn(), groupBy: vi.fn() },
    tenantPayment: { findMany: vi.fn() },
  },
}))

import { getJson, setJson } from "@/lib/redis/cache"
import { prisma } from "@/lib/prisma"
import {
  getActiveTenantsCached,
  getReferralActiveTenantsCached,
} from "./snapshot"

const getJsonMock = getJson as unknown as ReturnType<typeof vi.fn>
const setJsonMock = setJson as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as { tenant: { findMany: ReturnType<typeof vi.fn> } }

beforeEach(() => {
  vi.clearAllMocks()
  setJsonMock.mockResolvedValue(undefined)
})

describe("getActiveTenantsCached (PERF-011)", () => {
  it("HIT: retorna do cache sem tocar o Postgres", async () => {
    getJsonMock.mockResolvedValue([{ id: "t1", name: "A" }])
    const out = await getActiveTenantsCached()
    expect(out).toEqual([{ id: "t1", name: "A" }])
    expect(getJsonMock).toHaveBeenCalledWith("placar:active")
    expect(p.tenant.findMany).not.toHaveBeenCalled()
  })

  it("MISS: lê do banco e popula com TTL 5s", async () => {
    getJsonMock.mockResolvedValue(null)
    p.tenant.findMany.mockResolvedValue([{ id: "t2", name: "B" }])
    const out = await getActiveTenantsCached()
    expect(out).toEqual([{ id: "t2", name: "B" }])
    expect(setJsonMock).toHaveBeenCalledWith("placar:active", [{ id: "t2", name: "B" }], 5)
  })
})

describe("getReferralActiveTenantsCached (PERF-011)", () => {
  it("chave namespaceada por referrerTenantId (isolamento entre revendedores)", async () => {
    getJsonMock.mockResolvedValue([{ id: "r1", name: "Ind" }])
    const out = await getReferralActiveTenantsCached("ref-42")
    expect(out).toEqual([{ id: "r1", name: "Ind" }])
    expect(getJsonMock).toHaveBeenCalledWith("placar:ref:active:ref-42")
    expect(p.tenant.findMany).not.toHaveBeenCalled()
  })
})
