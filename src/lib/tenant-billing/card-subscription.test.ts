import { describe, it, expect, vi, beforeEach } from "vitest"

const calls: string[] = []
const asaas = vi.hoisted(() => ({
  getPayment: vi.fn(),
  createSubscription: vi.fn(),
  deletePayment: vi.fn(),
  cancelSubscription: vi.fn(),
  listPayments: vi.fn(),
}))
const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
  tenantPayment: { create: vi.fn() },
}))

vi.mock("@/lib/asaas/client", async () => {
  const real = await vi.importActual<typeof import("@/lib/asaas/client")>("@/lib/asaas/client")
  return { ...real, ...asaas, motherAsaasKey: () => "mother" }
})
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: () => BigInt(1),
  withAdvisoryLock: async (_k: bigint, fn: () => Promise<void>) => {
    await fn()
    return true
  },
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))

import { AsaasApiError } from "@/lib/asaas/client"
import { convertChargeToCardSubscription } from "./card-subscription"

const input = {
  paymentId: "pay_old",
  creditCard: { holderName: "X", number: "4111111111111111", expiryMonth: "12", expiryYear: "2030", ccv: "123" },
  creditCardHolderInfo: { name: "X", email: "x@x.com", cpfCnpj: "52998224725", postalCode: "30000000", addressNumber: "1", phone: "31999998888" },
  remoteIp: "1.2.3.4",
}

function tenant(planValue: number, promo: string | null = null) {
  return { id: "t1", name: "Loja", slug: "loja", planValue, asaasCustomerId: "cus_1", asaasPromoSubscriptionId: promo }
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  asaas.getPayment.mockResolvedValue({
    id: "pay_old", status: "PENDING", deleted: false, subscription: "sub_old", customer: "cus_1", value: 329,
  })
  db.tenant.count.mockResolvedValue(1)
  asaas.createSubscription.mockImplementation(async (p: { value: number }) => {
    calls.push(`create:${p.value}`)
    return { id: "sub_new" }
  })
  db.tenant.update.mockImplementation(async () => calls.push("tenant.update"))
  asaas.deletePayment.mockImplementation(async () => calls.push("deletePayment"))
  asaas.cancelSubscription.mockImplementation(async () => calls.push("cancelOld"))
  asaas.listPayments.mockResolvedValue({ data: [{ id: "pay_new", status: "CONFIRMED", dueDate: "2026-11-05" }] })
  db.tenantPayment.create.mockResolvedValue({})
})

describe("convertChargeToCardSubscription", () => {
  it("329 vira assinatura de 289 no cartão; aponta a unidade ANTES de cancelar a antiga", async () => {
    db.tenant.findUnique.mockResolvedValue(tenant(329))
    const r = await convertChargeToCardSubscription(input)
    expect(r).toEqual({ ok: true, status: "CONFIRMED", value: 289, pending: false })
    // Cancelar antes do update: o SUBSCRIPTION_DELETED da antiga suspenderia a unidade.
    expect(calls).toEqual(["create:289", "tenant.update", "deletePayment", "cancelOld"])
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { asaasSubscriptionId: "sub_new", planValue: 289 },
    })
    expect(asaas.createSubscription.mock.calls[0][0]).toMatchObject({
      billingType: "CREDIT_CARD",
      cycle: "MONTHLY",
      externalReference: "tenant:loja",
      remoteIp: "1.2.3.4",
    })
  })

  it("cartão recusado: nada muda na unidade nem na assinatura antiga", async () => {
    db.tenant.findUnique.mockResolvedValue(tenant(329))
    asaas.createSubscription.mockRejectedValue(
      new AsaasApiError("recusado", 400, [{ code: "x", description: "Transação não autorizada" }]),
    )
    const r = await convertChargeToCardSubscription(input)
    expect(r).toEqual({ ok: false, status: 400, error: "Transação não autorizada" })
    expect(db.tenant.update).not.toHaveBeenCalled()
    expect(asaas.cancelSubscription).not.toHaveBeenCalled()
    expect(asaas.deletePayment).not.toHaveBeenCalled()
  })

  it("unidade antiga (239) ou com promo não troca", async () => {
    for (const t of [tenant(239), tenant(329, "sub_promo")]) {
      db.tenant.findUnique.mockResolvedValue(t)
      const r = await convertChargeToCardSubscription(input)
      expect(r.ok).toBe(false)
    }
    expect(asaas.createSubscription).not.toHaveBeenCalled()
  })

  it("segundo clique (unidade já saiu da assinatura antiga) não cobra de novo", async () => {
    db.tenant.findUnique.mockResolvedValue(tenant(329))
    db.tenant.count.mockResolvedValue(0)
    const r = await convertChargeToCardSubscription(input)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(asaas.createSubscription).not.toHaveBeenCalled()
  })
})
