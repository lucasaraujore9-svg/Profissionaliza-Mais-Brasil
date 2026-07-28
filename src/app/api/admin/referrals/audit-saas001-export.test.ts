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
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin: vi.fn() }))
// Rotas de /painel resolvem papel + permissoes via painelContext (consulta
// prisma.user/tenantMember). Mockamos o guard e usamos um contexto coerente
// derivado dos presets reais — ver src/test/painel-ctx.ts.
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { adminGuardFor } from "@/test/admin-ctx"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"

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
const guardMock = requireAdmin as unknown as ReturnType<typeof vi.fn>
const resellerSession = requirePainel as unknown as ReturnType<typeof vi.fn>

const req = (url: string) => new Request(url)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  guardMock.mockImplementation(adminGuardFor({ role: "SUPER_ADMIN" }).requireAdmin)
  resellerSession.mockResolvedValue(painelGuardOk({ userId: "u2" }))
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
