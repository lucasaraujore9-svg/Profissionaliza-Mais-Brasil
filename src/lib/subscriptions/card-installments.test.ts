import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Assinatura parcelada no cartão. O risco caro é o do Asaas: uma compra em 12x
 * vira 12 cobranças confirmadas no mesmo minuto, todas com `pmb_sub_<id>` — se
 * cada uma liquidasse um período, 12x dariam 12 períodos de acesso.
 */

const db = vi.hoisted(() => ({
  subscriptionPayment: { findFirst: vi.fn(), updateMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})
vi.mock("@/lib/subscriptions/renew", () => ({
  settleSubscriptionCycle: vi.fn(async () => ({ settled: true })),
  recordOpenSubscriptionCharge: vi.fn(async () => undefined),
  markSubscriptionPastDue: vi.fn(async () => undefined),
  revokeSubscriptionForRefund: vi.fn(async () => undefined),
}))
vi.mock("@/lib/subscriptions/carne", () => ({
  CarneInputError: class extends Error {},
  resetSubscriptionCarne: vi.fn(),
}))
vi.mock("@/lib/asaas/client", () => ({ AsaasApiError: class extends Error {} }))
vi.mock("@/lib/mercadopago/client", () => ({ MPApiError: class extends Error {} }))

import { settleSubscriptionCycle } from "@/lib/subscriptions/renew"
import { applyAsaasSubscriptionEvent } from "./asaas-events"
import { subscriptionCardInstallmentsCap } from "./carne-schedule"

const settle = settleSubscriptionCycle as unknown as ReturnType<typeof vi.fn>

const parcel = (installmentNumber: number) => ({
  id: `pay_${installmentNumber}`,
  value: 50,
  paymentDate: "2026-10-28",
  dueDate: "2026-10-28",
  billingType: "CREDIT_CARD",
  invoiceUrl: "",
  bankSlipUrl: "",
  installment: "ins_1",
  installmentNumber,
})

const sub = { id: "sub_1", boletoCarne: true }
const openRow = { id: "row_1", amount: 600, dueDate: new Date("2026-10-28T12:00:00Z") }

beforeEach(() => {
  vi.clearAllMocks()
  db.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 })
})

describe("parcela do cartão parcelado no webhook do Asaas", () => {
  it("parcelas 2..N confirmadas NÃO liquidam período nenhum", async () => {
    // O período está em aberto (webhooks paralelos: a parcela 2 pode chegar
    // antes da 1ª) — só a trava da 1ª parcela impede que ela o liquide.
    db.subscriptionPayment.findFirst.mockImplementation(async ({ where }) =>
      where.asaasPaymentId === null ? openRow : null,
    )
    for (const n of [2, 3, 12]) {
      await applyAsaasSubscriptionEvent(sub, "PAYMENT_CONFIRMED", parcel(n))
      await applyAsaasSubscriptionEvent(sub, "PAYMENT_RECEIVED", parcel(n))
    }
    expect(settle).not.toHaveBeenCalled()
  })

  it("a 1ª parcela liga a linha aberta e liquida UM período pelo valor cheio", async () => {
    // Sem linha ligada ao pagamento; a do período em aberto vem na 2ª busca.
    db.subscriptionPayment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(openRow)
    await applyAsaasSubscriptionEvent(sub, "PAYMENT_CONFIRMED", parcel(1))
    expect(db.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { id: "row_1", asaasPaymentId: null },
      data: { asaasPaymentId: "pay_1" },
    })
    expect(settle).toHaveBeenCalledTimes(1)
    // O PERÍODO (R$ 600), não a parcela (R$ 50): é o que a receita soma.
    expect(settle).toHaveBeenCalledWith("sub_1", expect.objectContaining({
      externalPaymentId: "pay_1",
      amount: 600,
    }))
  })

  it("cobrança sem `installment` segue o caminho do carnê de sempre", async () => {
    await applyAsaasSubscriptionEvent(sub, "PAYMENT_CONFIRMED", { ...parcel(1), installment: null })
    expect(settle).toHaveBeenCalledWith("sub_1", expect.objectContaining({ amount: 50 }))
  })
})

describe("subscriptionCardInstallmentsCap", () => {
  it("Asaas: o teto é o nº sem juros da unidade, com parcela mínima de R$ 5", () => {
    expect(subscriptionCardInstallmentsCap("ASAAS", 600, 10)).toBe(10)
    expect(subscriptionCardInstallmentsCap("ASAAS", 600, 1)).toBe(1)
    expect(subscriptionCardInstallmentsCap("ASAAS", 19.9, 10)).toBe(3)
  })

  it("Mercado Pago: até 12x (juros do aluno acima do sem juros), com o mesmo piso", () => {
    expect(subscriptionCardInstallmentsCap("MP", 600, 1)).toBe(12)
    expect(subscriptionCardInstallmentsCap("MP", 30, 1)).toBe(6)
    expect(subscriptionCardInstallmentsCap("MP", 9, 1)).toBe(1)
  })
})
