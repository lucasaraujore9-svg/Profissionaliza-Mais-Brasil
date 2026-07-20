import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-001: prova que as mutações sensíveis do admin (status/mensalidade/
// referral-percent/sales/manager/password) gravam trilha de auditoria com o
// `action` esperado. Mocka logAudit e afirma a chamada por rota.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/auth/admin-session", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/lib/auth/guards", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/auth/roles", () => ({ canManageCommissions: () => true }))
vi.mock("bcryptjs", () => ({ hash: vi.fn(async () => "hash") }))
vi.mock("@/lib/students/generate-password", () => ({
  generateTemporaryPassword: () => "senha-gerada",
}))

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { requireSuperAdmin } from "@/lib/auth/guards"

import { PATCH as statusPatch } from "./revendedores/[id]/status/route"
import { PUT as mensalidadePut } from "./tenants/[id]/mensalidade/route"
import { PUT as referralPut } from "./tenants/[id]/referral-percent/route"
import { PATCH as salesPatch } from "./revendedores/[id]/sales/route"
import { PATCH as managerPatch } from "./revendedores/[id]/manager/route"
import { PATCH as passwordPatch } from "./revendedores/[id]/password/route"

const audit = logAudit as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const adminSession = requireAdminSession as unknown as ReturnType<typeof vi.fn>
const superAdmin = requireSuperAdmin as unknown as ReturnType<typeof vi.fn>

function jreq(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  adminSession.mockResolvedValue({ userId: "u1", role: "SUPER_ADMIN" })
  superAdmin.mockResolvedValue({ ok: true, session: { userId: "u1", role: "SUPER_ADMIN" } })
})

describe("SAAS-001 — audit trail em mutações admin", () => {
  it("status → tenant.status.update", async () => {
    p.tenant.findUnique.mockResolvedValue({
      id: "t1", slug: "s", customDomain: null, accountManagerId: null, status: "ACTIVE",
    })
    p.tenant.update.mockResolvedValue({})
    const res = await statusPatch(jreq({ status: "SUSPENDED" }), params("t1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.status.update" }))
  })

  it("mensalidade → tenant.monthly.update", async () => {
    p.tenant.findUnique.mockResolvedValue({
      id: "t1", slug: "s", customDomain: null, accountManagerId: null,
      monthlyAllowed: false, monthlyEnabled: false, monthlyScope: "DIRECT_ONLY",
    })
    p.tenant.update.mockResolvedValue({ id: "t1", monthlyAllowed: true, monthlyEnabled: true, monthlyScope: "DIRECT_ONLY" })
    const res = await mensalidadePut(
      jreq({ monthlyAllowed: true, monthlyScope: "DIRECT_ONLY" }),
      params("t1"),
    )
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.monthly.update" }))
  })

  it("referral-percent → tenant.referral_percent.update", async () => {
    p.tenant.findUnique.mockResolvedValue({
      id: "t1", referralPercent: null, referralMinReferrals: null,
      commissionMode: null, commissionOverrideSource: null,
    })
    p.tenant.update.mockResolvedValue({
      id: "t1", referralPercent: null, referralMinReferrals: null, referralTiers: null,
      commissionMode: null, commissionBracketBasis: null, commissionRateType: null,
      commissionPayoutBase: null, commissionBrackets: null, commissionPlan: null,
      commissionPlanStartedAt: null, commissionOverrideSource: null,
    })
    // `percent` saiu do contrato na unificacao: a regra e sempre o bloco
    // commission* (aqui, o equivalente do editor Simples: 10% em faixa unica).
    const res = await referralPut(
      jreq({
        commissionMode: "MONTHLY_TIERED",
        commissionRateType: "PERCENT",
        commissionBracketBasis: "ACTIVE_UNITS",
        commissionPayoutBase: "ALL_ACTIVE",
        commissionBrackets: [{ upTo: null, value: 10 }],
        commissionPlan: null,
      }),
      params("t1"),
    )
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.referral_percent.update" }))
  })

  it("sales → tenant.sales.update", async () => {
    p.tenant.findUnique.mockResolvedValue({ salesUserId: null })
    p.tenant.update.mockResolvedValue({ id: "t1", salesUserId: null, salesUser: null })
    const res = await salesPatch(jreq({ salesUserId: null }), params("t1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.sales.update" }))
  })

  it("manager → tenant.manager.update", async () => {
    p.tenant.findUnique.mockResolvedValue({ accountManagerId: null })
    p.tenant.update.mockResolvedValue({ id: "t1", accountManagerId: null, accountManager: null })
    const res = await managerPatch(jreq({ managerId: null }), params("t1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.manager.update" }))
  })

  it("password → reseller.password.reset sem senha em texto puro", async () => {
    p.tenant.findUnique.mockResolvedValue({
      id: "t1", slug: "s", accountManagerId: null,
      owner: { id: "o1", email: "o@x.com", name: "Owner" },
    })
    p.user.update.mockResolvedValue({})
    const res = await passwordPatch(jreq({ generate: true }), params("t1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "reseller.password.reset" }))
    const call = audit.mock.calls.find((c) => c[0].action === "reseller.password.reset")
    expect(JSON.stringify(call?.[0])).not.toContain("senha-gerada")
  })
})
