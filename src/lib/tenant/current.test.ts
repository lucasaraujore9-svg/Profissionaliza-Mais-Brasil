import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-001: getCurrentTenant passou a cachear o branding do tenant em Redis
// (tenant:branding:{id}). HIT no cache não bate no Postgres; MISS lê e popula.
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }))
vi.mock("next/headers", () => ({ headers: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findFirst: vi.fn() } } }))
vi.mock("@/lib/redis/tenant-cache", () => ({
  getTenantBranding: vi.fn(),
  setTenantBranding: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { getTenantBranding, setTenantBranding } from "@/lib/redis/tenant-cache"
import { getCurrentTenant } from "./current"

const headersMock = headers as unknown as ReturnType<typeof vi.fn>
const findFirst = (prisma as unknown as { tenant: { findFirst: ReturnType<typeof vi.fn> } }).tenant.findFirst
const getBranding = getTenantBranding as unknown as ReturnType<typeof vi.fn>
const setBranding = setTenantBranding as unknown as ReturnType<typeof vi.fn>

function withHeaders(map: Record<string, string | null>) {
  headersMock.mockResolvedValue({ get: (k: string) => map[k] ?? null })
}

beforeEach(() => {
  vi.clearAllMocks()
  setBranding.mockResolvedValue(undefined)
})

describe("getCurrentTenant — cache de branding (PERF-001)", () => {
  it("HIT: retorna do cache sem tocar o Postgres", async () => {
    withHeaders({ "x-tenant-id": "t1", "x-tenant-slug": "slug1" })
    getBranding.mockResolvedValue({ id: "t1", slug: "slug1", name: "Cached" })

    const out = await getCurrentTenant()

    expect(out).toMatchObject({ id: "t1", name: "Cached" })
    expect(getBranding).toHaveBeenCalledWith("t1")
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("MISS: lê do banco e popula o cache por id", async () => {
    withHeaders({ "x-tenant-id": "t1", "x-tenant-slug": "slug1" })
    getBranding.mockResolvedValue(null)
    findFirst.mockResolvedValue({ id: "t1", slug: "slug1", name: "Fresh" })

    const out = await getCurrentTenant()

    expect(out).toMatchObject({ id: "t1", name: "Fresh" })
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(setBranding).toHaveBeenCalledWith("t1", expect.objectContaining({ id: "t1" }))
  })

  it("resolve por slug (sem id): não consulta cache; popula pelo id real", async () => {
    withHeaders({ "x-tenant-id": null, "x-tenant-slug": "slug1" })
    findFirst.mockResolvedValue({ id: "t-real", slug: "slug1", name: "BySlug" })

    const out = await getCurrentTenant()

    expect(out).toMatchObject({ id: "t-real" })
    expect(getBranding).not.toHaveBeenCalled()
    expect(setBranding).toHaveBeenCalledWith("t-real", expect.objectContaining({ id: "t-real" }))
  })

  it("sem headers de tenant: retorna null", async () => {
    withHeaders({ "x-tenant-id": null, "x-tenant-slug": null })
    const out = await getCurrentTenant()
    expect(out).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })
})
