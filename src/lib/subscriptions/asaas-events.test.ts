import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Evento de assinatura do Asaas — a MESMA decisão para a conta-mãe e para a
 * conta da unidade. E o roteamento na conta da unidade, que só achava a
 * assinatura pelo `subscription` do Asaas: a cobrança AVULSA (boleto do carnê,
 * acesso vitalício) chegava sem ele e o aluno pagava sem nunca ter acesso.
 */

const db = vi.hoisted(() => ({
  subscriptionPayment: { updateMany: vi.fn() },
  studentSubscription: { findFirst: vi.fn() },
  boletoInstallment: { findFirst: vi.fn() },
  enrollment: { findFirst: vi.fn() },
  webhookLog: { update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("@/lib/subscriptions/renew", () => ({
  settleSubscriptionCycle: vi.fn(async () => ({ settled: true })),
  recordOpenSubscriptionCharge: vi.fn(async () => undefined),
  markSubscriptionPastDue: vi.fn(async () => undefined),
  revokeSubscriptionForRefund: vi.fn(async () => undefined),
}))
vi.mock("@/lib/asaas/client", () => ({
  getPayment: vi.fn(),
  AsaasApiError: class extends Error {},
}))
vi.mock("@/lib/asaas/fulfillment", () => ({ fulfillFromAsaasPayment: vi.fn() }))
vi.mock("@/lib/installments/settle", () => ({ settleBoletoInstallment: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/course-authoring/split-webhook", () => ({
  applySplitEvent: vi.fn(),
  splitIdFromPayload: vi.fn(),
}))

import { getPayment } from "@/lib/asaas/client"
import {
  markSubscriptionPastDue,
  recordOpenSubscriptionCharge,
  settleSubscriptionCycle,
} from "@/lib/subscriptions/renew"
import { applyAsaasSubscriptionEvent } from "./asaas-events"
import { processResellerAsaasWebhook } from "@/lib/asaas/reseller-process"

const settle = settleSubscriptionCycle as unknown as ReturnType<typeof vi.fn>
const recordOpen = recordOpenSubscriptionCharge as unknown as ReturnType<typeof vi.fn>
const pastDue = markSubscriptionPastDue as unknown as ReturnType<typeof vi.fn>
const fetchPayment = getPayment as unknown as ReturnType<typeof vi.fn>

const payment = {
  id: "pay_1",
  value: 59.9,
  paymentDate: "2026-10-09",
  dueDate: "2026-10-10",
  billingType: "BOLETO",
  invoiceUrl: "https://asaas/i/pay_1",
  bankSlipUrl: "https://asaas/b/pay_1.pdf",
}

beforeEach(() => {
  vi.clearAllMocks()
  db.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 })
  db.webhookLog.update.mockResolvedValue({})
})

describe("applyAsaasSubscriptionEvent", () => {
  it("atraso de boleto do CARNÊ não mexe no status — quem decide é o fim do período", async () => {
    // O Mercado Pago nem avisa atraso: marcar PAST_DUE só no Asaas faria as
    // duas pontas se comportarem diferente para a mesma assinatura.
    await applyAsaasSubscriptionEvent({ id: "sub_1", boletoCarne: true }, "PAYMENT_OVERDUE", payment)
    expect(recordOpen).toHaveBeenCalledWith("sub_1", expect.objectContaining({ status: "OVERDUE" }))
    expect(pastDue).not.toHaveBeenCalled()
  })

  it("na recorrência do gateway o atraso continua marcando PAST_DUE", async () => {
    await applyAsaasSubscriptionEvent({ id: "sub_1", boletoCarne: false }, "PAYMENT_OVERDUE", payment)
    expect(pastDue).toHaveBeenCalledWith("sub_1")
  })

  it("boleto do carnê removido no Asaas fica cancelado (sem tocar em boleto pago)", async () => {
    await applyAsaasSubscriptionEvent({ id: "sub_1", boletoCarne: true }, "PAYMENT_DELETED", payment)
    expect(db.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: { asaasPaymentId: "pay_1", paidAt: null, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    })
  })

  it("pagamento liquida o ciclo", async () => {
    await applyAsaasSubscriptionEvent({ id: "sub_1", boletoCarne: true }, "PAYMENT_RECEIVED", payment)
    expect(settle).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ externalPaymentId: "pay_1", amount: 59.9 }),
    )
  })
})

describe("webhook da conta da UNIDADE", () => {
  const tenant = {
    id: "ten_1",
    slug: "unidade",
    name: "Unidade",
    plataformaVendedorId: null,
    apiKey: "unit-key",
  }

  it("cobrança AVULSA com `pmb_sub_` (boleto do carnê) chega na assinatura", async () => {
    fetchPayment.mockResolvedValue({
      ...payment,
      subscription: null,
      externalReference: "pmb_sub_sub_1",
    })
    db.boletoInstallment.findFirst.mockResolvedValue(null)
    db.studentSubscription.findFirst.mockResolvedValueOnce({ id: "sub_1", boletoCarne: true })

    await processResellerAsaasWebhook("log_1", tenant as never, {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    } as never)

    // Escopada à unidade do webhook.
    expect(db.studentSubscription.findFirst.mock.calls[0][0].where).toEqual({
      id: "sub_1",
      tenantId: "ten_1",
    })
    expect(settle).toHaveBeenCalledTimes(1)
    expect(db.enrollment.findFirst).not.toHaveBeenCalled()
  })

  it("assinatura de OUTRA unidade não é liquidada por esta conta", async () => {
    fetchPayment.mockResolvedValue({
      ...payment,
      subscription: null,
      externalReference: "pmb_sub_sub_de_outra",
    })
    db.boletoInstallment.findFirst.mockResolvedValue(null)
    db.studentSubscription.findFirst.mockResolvedValue(null)
    db.enrollment.findFirst.mockResolvedValue(null)

    await processResellerAsaasWebhook("log_1", tenant as never, {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    } as never)

    expect(settle).not.toHaveBeenCalled()
  })

  it("recorrência do Asaas continua achada pelo `subscription`", async () => {
    fetchPayment.mockResolvedValue({ ...payment, subscription: "asub_1", externalReference: null })
    db.boletoInstallment.findFirst.mockResolvedValue(null)
    db.studentSubscription.findFirst.mockResolvedValueOnce({ id: "sub_2", boletoCarne: false })

    await processResellerAsaasWebhook("log_1", tenant as never, {
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_1" },
    } as never)

    expect(db.studentSubscription.findFirst.mock.calls[0][0].where).toEqual({
      asaasSubscriptionId: "asub_1",
      tenantId: "ten_1",
    })
    expect(pastDue).toHaveBeenCalledWith("sub_2")
  })
})
