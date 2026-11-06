import { beforeEach, describe, expect, it, vi } from "vitest"

// Parcelado no cartão: a cobrança da assinatura Asaas baixa a próxima linha
// (settleFlexSubscriptionPayment) e NUNCA cai no caminho de mensalidade; o
// OVERDUE dela não suspende a matrícula. Vale na conta-mãe (PMB) e na da unidade.

const db = vi.hoisted(() => ({
  boletoInstallment: { findFirst: vi.fn(async () => null) },
  enrollment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  studentSubscription: { findFirst: vi.fn(async () => null) },
  tenant: { findFirst: vi.fn(async () => null) },
  tenantPayment: { upsert: vi.fn() },
  webhookLog: { update: vi.fn(async () => undefined) },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
const asaas = vi.hoisted(() => ({ getPayment: vi.fn(), AsaasApiError: class extends Error {} }))
vi.mock("./client", () => asaas)
vi.mock("@/lib/installments/flex-card", () => ({ settleFlexSubscriptionPayment: vi.fn(async () => "settled") }))
vi.mock("./fulfillment", () => ({ fulfillFromAsaasPayment: vi.fn() }))
vi.mock("@/lib/webhooks/transient", () => ({ isTransientWebhookError: () => false }))
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/auto-block", () => ({ blockTenantStudents: vi.fn(), unblockTenantStudents: vi.fn() }))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn() }))
vi.mock("@/lib/installments/settle", () => ({ settleBoletoInstallment: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/referrals/commission", () => ({
  createCommissionForTenantPayment: vi.fn(),
  cancelCommissionForTenantPayment: vi.fn(),
  freezeCommissionForPartialRefund: vi.fn(),
}))
vi.mock("@/lib/referrals/monthly", () => ({ flagMonthlyCommissionForRefund: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/course-authoring/split-webhook", () => ({
  applySplitEvent: vi.fn(),
  isSplitEvent: () => false,
  splitIdFromPayload: () => null,
}))
vi.mock("@/lib/subscriptions/asaas-events", () => ({ applyAsaasSubscriptionEvent: vi.fn() }))
vi.mock("@/lib/subscriptions/carne", () => ({ linkPixAutomaticFirstPayment: vi.fn(async () => null) }))
vi.mock("@/lib/webhooks-saida/unidade", () => ({ emitUnidadePagamento: vi.fn(), emitUnidadeStatus: vi.fn() }))
vi.mock("@/lib/pmb-config", () => ({ pmbPlataformaPolo: () => "pmb", pmbPlataformaVendedorId: () => null }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})

import { settleFlexSubscriptionPayment } from "@/lib/installments/flex-card"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { fulfillFromAsaasPayment } from "./fulfillment"
import { processAsaasWebhook } from "./process"
import { processResellerAsaasWebhook } from "./reseller-process"

const charge = (externalReference: string) => ({
  id: "pay_7",
  value: 100,
  status: "CONFIRMED",
  customer: "cus_1",
  subscription: "sub_1",
  externalReference,
  installment: null,
  billingType: "CREDIT_CARD",
  dueDate: "2026-12-06",
  paymentDate: "2026-12-06",
})
const flexEnrollment = (tenantId: string | null) => ({
  id: "enr1",
  tenantId,
  status: "PENDING",
  flexInstallments: true,
  asaasSubscriptionId: "sub_1",
  paymentType: "BOLETO_INSTALLMENT",
  installmentsTotal: 4,
  installmentsPaid: 1,
})
const unit = { id: "t1", slug: "loja", name: "Loja", plataformaVendedorId: "v1", apiKey: "k" }
const settled = {
  enrollmentId: "enr1",
  event: expect.objectContaining({ gateway: "ASAAS", externalPaymentId: "pay_7", amount: 100 }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("conta-mãe (vitrine PMB)", () => {
  beforeEach(() => {
    asaas.getPayment.mockResolvedValue(charge("pmb_enr_enr1"))
    db.enrollment.findFirst.mockResolvedValue(flexEnrollment(null))
    db.enrollment.findUnique.mockResolvedValue(flexEnrollment(null))
  })

  it("cobrança da assinatura baixa a linha, sem fulfill de mensalidade", async () => {
    await processAsaasWebhook("log1", { event: "PAYMENT_CONFIRMED", payment: charge("pmb_enr_enr1") } as never)
    expect(settleFlexSubscriptionPayment).toHaveBeenCalledWith(settled)
    expect(fulfillEnrollment).not.toHaveBeenCalled()
  })

  it("1ª cobrança chega antes de o id da assinatura ser gravado: baixa a linha mesmo assim", async () => {
    db.enrollment.findFirst.mockResolvedValue(null) // ninguém tem `sub_1` ainda
    db.enrollment.findUnique.mockResolvedValue({ ...flexEnrollment(null), asaasSubscriptionId: null })
    await processAsaasWebhook("log1", { event: "PAYMENT_CONFIRMED", payment: charge("pmb_enr_enr1") } as never)
    expect(settleFlexSubscriptionPayment).toHaveBeenCalledWith(settled)
    expect(fulfillEnrollment).not.toHaveBeenCalled()
  })

  it("OVERDUE não suspende a matrícula", async () => {
    await processAsaasWebhook("log1", { event: "PAYMENT_OVERDUE", payment: charge("pmb_enr_enr1") } as never)
    expect(db.enrollment.update).not.toHaveBeenCalled()
    expect(settleFlexSubscriptionPayment).not.toHaveBeenCalled()
  })
})

describe("conta da unidade", () => {
  beforeEach(() => {
    asaas.getPayment.mockResolvedValue(charge("enr_enr1"))
    db.enrollment.findFirst.mockResolvedValue(flexEnrollment("t1"))
  })

  it("cobrança da assinatura baixa a linha, sem fulfill de mensalidade", async () => {
    await processResellerAsaasWebhook("log1", unit, { event: "PAYMENT_RECEIVED", payment: charge("enr_enr1") } as never)
    expect(settleFlexSubscriptionPayment).toHaveBeenCalledWith(settled)
    expect(fulfillFromAsaasPayment).not.toHaveBeenCalled()
  })

  it("cobrança de assinatura com id diferente do gravado: nunca cai no fulfill de mensalidade", async () => {
    db.enrollment.findFirst.mockResolvedValue({ ...flexEnrollment("t1"), asaasSubscriptionId: "sub_outra" })
    await processResellerAsaasWebhook("log1", unit, { event: "PAYMENT_CONFIRMED", payment: charge("enr_enr1") } as never)
    expect(settleFlexSubscriptionPayment).toHaveBeenCalledWith(settled)
    expect(fulfillFromAsaasPayment).not.toHaveBeenCalled()
  })

  it("OVERDUE não suspende a matrícula", async () => {
    await processResellerAsaasWebhook("log1", unit, { event: "PAYMENT_OVERDUE", payment: charge("enr_enr1") } as never)
    expect(db.enrollment.update).not.toHaveBeenCalled()
  })
})
