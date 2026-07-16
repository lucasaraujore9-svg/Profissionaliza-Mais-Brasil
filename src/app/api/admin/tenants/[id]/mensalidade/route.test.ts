import { describe, it, expect, vi, beforeEach } from "vitest"

// Ao LIBERAR o parcelado (bloqueado → liberado), o monthlyEnabled da unidade
// liga junto — o carnê/mensalidade fica disponível sem depender do revendedor.
// Re-saves com a capability já liberada (ex.: troca de escopo) e o bloqueio
// NÃO tocam no monthlyEnabled, preservando a escolha do revendedor.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/auth/admin-session", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PUT } from "./route"

const p = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const adminSession = requireAdminSession as unknown as ReturnType<typeof vi.fn>

function jreq(body: unknown) {
  return new Request("http://x", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

function mockTenant(overrides: Partial<Record<string, unknown>> = {}) {
  p.tenant.findUnique.mockResolvedValue({
    id: "t1",
    slug: "s",
    customDomain: null,
    accountManagerId: null,
    monthlyAllowed: false,
    monthlyEnabled: false,
    monthlyScope: "DIRECT_ONLY",
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  adminSession.mockResolvedValue({ userId: "u1", role: "SUPER_ADMIN" })
  p.tenant.update.mockResolvedValue({
    id: "t1",
    monthlyAllowed: true,
    monthlyEnabled: true,
    monthlyScope: "DIRECT_ONLY",
  })
})

describe("PUT /api/admin/tenants/[id]/mensalidade — auto-ativação ao liberar", () => {
  it("liberar (false → true) liga o monthlyEnabled da unidade junto", async () => {
    mockTenant({ monthlyAllowed: false, monthlyEnabled: false })
    const res = await PUT(
      jreq({ monthlyAllowed: true, monthlyScope: "DIRECT_ONLY" }),
      params("t1"),
    )
    expect(res.status).toBe(200)
    expect(p.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monthlyAllowed: true,
          monthlyEnabled: true,
        }),
      }),
    )
  })

  it("re-save já liberado (ex.: troca de escopo) não mexe no monthlyEnabled", async () => {
    mockTenant({ monthlyAllowed: true, monthlyEnabled: false })
    const res = await PUT(
      jreq({ monthlyAllowed: true, monthlyScope: "DIRECT_AND_VITRINE" }),
      params("t1"),
    )
    expect(res.status).toBe(200)
    const data = p.tenant.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty("monthlyEnabled")
  })

  it("bloquear (true → false) não mexe no monthlyEnabled", async () => {
    mockTenant({ monthlyAllowed: true, monthlyEnabled: true })
    const res = await PUT(
      jreq({ monthlyAllowed: false, monthlyScope: "DIRECT_ONLY" }),
      params("t1"),
    )
    expect(res.status).toBe(200)
    const data = p.tenant.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty("monthlyEnabled")
  })
})
