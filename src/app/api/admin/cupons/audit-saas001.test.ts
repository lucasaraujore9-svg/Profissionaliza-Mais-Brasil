import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-001: prova que o CRUD/toggle de cupom (admin PMB + painel revenda) grava
// trilha de auditoria com o `action` esperado.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenantMember: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/auth/guards", () => ({ requirePmbSales: vi.fn() }))
// Rotas de /painel resolvem papel + permissoes via painelContext (consulta
// prisma.user/tenantMember). Mockamos o guard e usamos um contexto coerente
// derivado dos presets reais — ver src/test/painel-ctx.ts.
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"

import { POST as adminCreate } from "./route"
import { PATCH as adminToggle } from "./[id]/toggle/route"
import { POST as painelCreate } from "../../painel/cupons/route"

const audit = logAudit as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as {
  coupon: {
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  tenantMember: { findUnique: ReturnType<typeof vi.fn> }
}
const pmbSales = requirePmbSales as unknown as ReturnType<typeof vi.fn>
const resellerSession = requirePainel as unknown as ReturnType<typeof vi.fn>

function jreq(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const validCoupon = {
  code: "TESTE10",
  discountType: "PERCENTAGE" as const,
  discountValue: 10,
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
}
const createdRow = {
  id: "c1",
  code: "TESTE10",
  discountType: "PERCENTAGE",
  discountValue: 10,
  maxUses: null,
  usedCount: 0,
  validFrom: new Date("2026-01-01"),
  validUntil: new Date("2026-12-31"),
  isActive: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  pmbSales.mockResolvedValue({ ok: true, session: { userId: "u1", role: "SUPER_ADMIN" } })
  resellerSession.mockResolvedValue(painelGuardOk({ userId: "u2" }))
})

describe("SAAS-001 — audit trail em cupons", () => {
  it("admin cria cupom → coupon.create", async () => {
    p.coupon.findFirst.mockResolvedValue(null)
    p.coupon.create.mockResolvedValue(createdRow)
    const res = await adminCreate(jreq(validCoupon))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "coupon.create" }))
  })

  it("admin toggle → coupon.toggle", async () => {
    p.coupon.findUnique.mockResolvedValue({
      id: "c1", tenantId: null, isActive: true, createdByUserId: "u1",
    })
    p.coupon.update.mockResolvedValue({ id: "c1", isActive: false })
    const res = await adminToggle(new Request("http://x", { method: "PATCH" }), params("c1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "coupon.toggle" }))
  })

  it("revenda cria cupom → coupon.create com tenantId", async () => {
    p.tenantMember.findUnique.mockResolvedValue(null)
    p.coupon.findUnique.mockResolvedValue(null)
    p.coupon.create.mockResolvedValue(createdRow)
    const res = await painelCreate(jreq(validCoupon))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "coupon.create", tenantId: "t1", actorRole: "RESELLER" }),
    )
  })
})
