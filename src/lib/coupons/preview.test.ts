import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { coupon: { findFirst: vi.fn() }, tenant: { findFirst: vi.fn() } },
}))

// Headers mutáveis por teste: simulam os x-tenant-* que o proxy injeta.
let headerStore: Record<string, string | null> = {}
vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => headerStore[k] ?? null }),
}))

vi.mock("@/lib/ratelimit", () => ({
  rateLimitByKey: vi.fn().mockResolvedValue({
    ok: true,
    remaining: 19,
    limit: 20,
    retryAfterSec: 0,
  }),
  RATE_LIMITS: { publicCupom: { name: "loja-cupom", limit: 20, windowSec: 60 } },
}))

import { prisma } from "@/lib/prisma"
import { rateLimitByKey } from "@/lib/ratelimit"
import { previewCheckoutCoupon } from "./preview"

const findFirst = prisma.coupon.findFirst as unknown as ReturnType<typeof vi.fn>
const tenantFindFirst = prisma.tenant.findFirst as unknown as ReturnType<typeof vi.fn>
const rlByKey = rateLimitByKey as unknown as ReturnType<typeof vi.fn>

const PAST = new Date("2020-01-01T00:00:00Z")
const FUTURE = new Date("2999-01-01T00:00:00Z")

function validCoupon(overrides: Record<string, unknown> = {}) {
  return {
    code: "PROMO50",
    discountType: "PERCENTAGE",
    discountValue: 50,
    maxUses: null,
    usedCount: 0,
    isActive: true,
    validFrom: PAST,
    validUntil: FUTURE,
    ...overrides,
  }
}

beforeEach(() => {
  findFirst.mockReset()
  tenantFindFirst.mockReset()
  headerStore = {}
  rlByKey.mockReset()
  rlByKey.mockResolvedValue({ ok: true, remaining: 19, limit: 20, retryAfterSec: 0 })
})

describe("previewCheckoutCoupon", () => {
  it("aplica desconto percentual em cupom válido", async () => {
    findFirst.mockResolvedValue(validCoupon())
    const r = await previewCheckoutCoupon({
      code: "promo50",
      basePrice: 200,
      scope: { kind: "tenant", tenantId: "t1" },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.coupon.code).toBe("PROMO50")
      expect(r.coupon.discountAmount).toBe(100)
      expect(r.coupon.finalPrice).toBe(100)
    }
  })

  it("escopo PMB (sem header de tenant) busca cupom com tenantId null", async () => {
    findFirst.mockResolvedValue(validCoupon({ discountType: "FIXED", discountValue: 30 }))
    const r = await previewCheckoutCoupon({
      code: "OFF30",
      basePrice: 100,
      scope: { kind: "pmb" },
    })
    expect(r.ok).toBe(true)
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: null, code: "OFF30" } }),
    )
    // Sem x-tenant-* no header → não consulta tenant.
    expect(tenantFindFirst).not.toHaveBeenCalled()
  })

  it("resolve o tenant pelos headers do proxy e IGNORA o scope do client (anti-enumeração cross-tenant)", async () => {
    headerStore = { "x-tenant-id": "real-tenant" }
    tenantFindFirst.mockResolvedValue({ id: "real-tenant" })
    findFirst.mockResolvedValue(validCoupon())
    const r = await previewCheckoutCoupon({
      code: "PROMO50",
      basePrice: 100,
      // scope adulterado pelo client apontando para OUTRA unidade:
      scope: { kind: "tenant", tenantId: "unidade-alheia-spoofada" },
    })
    expect(r.ok).toBe(true)
    // Tenant veio do header (não-spoofável), não do scope do client.
    expect(tenantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "real-tenant" } }),
    )
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "real-tenant", code: "PROMO50" } }),
    )
  })

  it("cupom inexistente → erro de digitação", async () => {
    findFirst.mockResolvedValue(null)
    const r = await previewCheckoutCoupon({
      code: "NOPE",
      basePrice: 100,
      scope: { kind: "tenant", tenantId: "t1" },
    })
    expect(r).toEqual({ ok: false, error: expect.stringContaining("não encontrado") })
  })

  it("cupom desativado → erro", async () => {
    findFirst.mockResolvedValue(validCoupon({ isActive: false }))
    const r = await previewCheckoutCoupon({
      code: "PROMO50",
      basePrice: 100,
      scope: { kind: "tenant", tenantId: "t1" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("desativado")
  })

  it("cupom expirado → erro", async () => {
    findFirst.mockResolvedValue(validCoupon({ validUntil: PAST }))
    const r = await previewCheckoutCoupon({
      code: "PROMO50",
      basePrice: 100,
      scope: { kind: "tenant", tenantId: "t1" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("expirou")
  })

  it("cupom esgotado (maxUses atingido) → erro", async () => {
    findFirst.mockResolvedValue(validCoupon({ maxUses: 5, usedCount: 5 }))
    const r = await previewCheckoutCoupon({
      code: "PROMO50",
      basePrice: 100,
      scope: { kind: "tenant", tenantId: "t1" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("esgotado")
  })

  it("preço base zero não aceita cupom (não consulta o banco)", async () => {
    const r = await previewCheckoutCoupon({
      code: "PROMO50",
      basePrice: 0,
      scope: { kind: "pmb" },
    })
    expect(r.ok).toBe(false)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("rate limit estourado → erro sem consultar o banco", async () => {
    rlByKey.mockResolvedValue({ ok: false, remaining: 0, limit: 20, retryAfterSec: 60 })
    const r = await previewCheckoutCoupon({
      code: "PROMO50",
      basePrice: 100,
      scope: { kind: "tenant", tenantId: "t1" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("Muitas tentativas")
    expect(findFirst).not.toHaveBeenCalled()
  })
})
