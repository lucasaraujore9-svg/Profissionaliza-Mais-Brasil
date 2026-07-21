import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-001: prova que as exportações de dados financeiros (financeiro da
// unidade, comissões/saques de indicação, comissões por revendedor) gravam
// trilha de auditoria com action=data.export.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: vi.fn() },
    referralCommission: { findMany: vi.fn() },
    referralMonthlyCommission: { findMany: vi.fn() },
    referralPayout: { findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/auth/admin-session", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/lib/auth/reseller-session", () => ({ requireResellerSession: vi.fn() }))

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { requireResellerSession } from "@/lib/auth/reseller-session"

import { GET as financeiroExport } from "../../painel/financeiro/export-csv/route"
import { GET as commissionsExport } from "./commissions/export/route"
import { GET as payoutsExport } from "./payouts/export/route"
import { GET as unitCommissionsExport } from "../revendedores/[id]/comissoes/export/route"

const audit = logAudit as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as {
  payment: { findMany: ReturnType<typeof vi.fn> }
  referralCommission: { findMany: ReturnType<typeof vi.fn> }
  referralMonthlyCommission: { findMany: ReturnType<typeof vi.fn> }
  referralPayout: { findMany: ReturnType<typeof vi.fn> }
  tenant: { findUnique: ReturnType<typeof vi.fn> }
}
const adminSession = requireAdminSession as unknown as ReturnType<typeof vi.fn>
const resellerSession = requireResellerSession as unknown as ReturnType<typeof vi.fn>

const req = (url: string) => new Request(url)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  adminSession.mockResolvedValue({ userId: "u1", role: "SUPER_ADMIN" })
  resellerSession.mockResolvedValue({ userId: "u2", tenantId: "t1" })
  p.payment.findMany.mockResolvedValue([])
  p.referralCommission.findMany.mockResolvedValue([])
  p.referralMonthlyCommission.findMany.mockResolvedValue([])
  p.referralPayout.findMany.mockResolvedValue([])
  p.tenant.findUnique.mockResolvedValue({ id: "t1", slug: "unidade", accountManagerId: null })
})

describe("SAAS-001 — audit trail em exportações financeiras", () => {
  it("financeiro da unidade → data.export/financeiro", async () => {
    const res = await financeiroExport(req("http://x/api/painel/financeiro/export-csv"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.export", resource: "financeiro", tenantId: "t1" }),
    )
  })

  it("comissões de indicação → data.export/commissions", async () => {
    const res = await commissionsExport(req("http://x/api/admin/referrals/commissions/export"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.export", resource: "commissions" }),
    )
  })

  it("saques de indicação → data.export/payouts", async () => {
    const res = await payoutsExport(req("http://x/api/admin/referrals/payouts/export"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.export", resource: "payouts" }),
    )
  })

  it("comissões por revendedor → data.export/commissions com tenantId", async () => {
    const res = await unitCommissionsExport(
      req("http://x/api/admin/revendedores/t1/comissoes/export"),
      params("t1"),
    )
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.export", resource: "commissions", tenantId: "t1" }),
    )
  })
})
