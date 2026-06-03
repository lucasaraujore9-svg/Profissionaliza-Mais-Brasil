import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do Prisma: so o branch PMB_RESELLER_MGR consulta o banco.
const tenantFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) } },
}))

import { adminCanAccessCertTenant } from "./admin-scope"

describe("adminCanAccessCertTenant — escopo de certificado por papel (regressao R24/IDOR)", () => {
  beforeEach(() => tenantFindUnique.mockReset())

  it("SUPER_ADMIN acessa qualquer certificado (PMB ou de revendedor) sem tocar no banco", async () => {
    expect(await adminCanAccessCertTenant("SUPER_ADMIN", "u1", null)).toBe(true)
    expect(await adminCanAccessCertTenant("SUPER_ADMIN", "u1", "tenant-x")).toBe(true)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })

  it("PMB_SALES so acessa certificados PMB (tenantId = null); nunca de revendedor", async () => {
    expect(await adminCanAccessCertTenant("PMB_SALES", "u1", null)).toBe(true)
    expect(await adminCanAccessCertTenant("PMB_SALES", "u1", "tenant-x")).toBe(false)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })

  it("PMB_RESELLER_MGR nunca acessa certificado PMB (null)", async () => {
    expect(await adminCanAccessCertTenant("PMB_RESELLER_MGR", "mgr1", null)).toBe(false)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })

  it("PMB_RESELLER_MGR acessa apenas tenants sob sua gestao (accountManagerId)", async () => {
    tenantFindUnique.mockResolvedValueOnce({ accountManagerId: "mgr1" })
    expect(await adminCanAccessCertTenant("PMB_RESELLER_MGR", "mgr1", "tenant-meu")).toBe(true)

    tenantFindUnique.mockResolvedValueOnce({ accountManagerId: "outro-gerente" })
    expect(await adminCanAccessCertTenant("PMB_RESELLER_MGR", "mgr1", "tenant-alheio")).toBe(false)

    tenantFindUnique.mockResolvedValueOnce(null)
    expect(await adminCanAccessCertTenant("PMB_RESELLER_MGR", "mgr1", "tenant-inexistente")).toBe(false)
  })

  it("RESELLER (papel sem acesso ao admin de certificados) e negado", async () => {
    expect(await adminCanAccessCertTenant("RESELLER", "u1", null)).toBe(false)
    expect(await adminCanAccessCertTenant("RESELLER", "u1", "tenant-x")).toBe(false)
  })
})
