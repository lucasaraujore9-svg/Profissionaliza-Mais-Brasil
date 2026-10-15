import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * PIX mandado direto para a chave da conta-mae vira, no Asaas, uma cobranca
 * avulsa no cliente do PAGADOR. Quando esse cliente e o titular de uma unidade,
 * o fallback de "mensalidade avulsa" (casamento por `customer`) contava o valor
 * como mensalidade: em 15/10/2026 um PIX de teste de R$ 1 e uma transferencia
 * de R$ 16 entraram no financeiro. Este arquivo trava o webhook: o PIX direto
 * nao vira TenantPayment e o financeiro e avisado uma vez.
 */

const db = vi.hoisted(() => ({
  boletoInstallment: { findFirst: vi.fn(async () => null) },
  enrollment: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
  tenant: {
    findFirst: vi.fn(async () => ({ id: "t_1", name: "Unidade Teste" })),
  },
  tenantPayment: { upsert: vi.fn() },
  webhookLog: { update: vi.fn(async () => undefined) },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const asaas = vi.hoisted(() => ({ getPayment: vi.fn(), AsaasApiError: class extends Error {} }))
vi.mock("./client", () => asaas)

vi.mock("@/lib/webhooks/transient", () => ({ isTransientWebhookError: () => false }))
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/auto-block", () => ({
  blockTenantStudents: vi.fn(),
  unblockTenantStudents: vi.fn(),
}))
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
vi.mock("@/lib/webhooks-saida/unidade", () => ({
  emitUnidadePagamento: vi.fn(),
  emitUnidadeStatus: vi.fn(),
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})

import { createNotification } from "@/lib/notifications"
import { processAsaasWebhook } from "./process"

// Payload real (pay_m46kg4ntn1mmxzcr), reduzido aos campos que o caminho le.
const pixDireto = {
  id: "pay_m46kg4ntn1mmxzcr",
  value: 1,
  status: "RECEIVED",
  customer: "cus_000203610083",
  subscription: null,
  externalReference: null,
  installment: null,
  billingType: "PIX",
  description: "Cobrança gerada automaticamente a partir de Pix recebido.",
  dueDate: "2026-10-15",
  paymentDate: "2026-10-15",
}

beforeEach(() => {
  vi.clearAllMocks()
  asaas.getPayment.mockResolvedValue(pixDireto)
})

describe("PIX direto na chave da conta-mae", () => {
  it("nao vira mensalidade da unidade do pagador", async () => {
    await processAsaasWebhook("log_1", { event: "PAYMENT_RECEIVED", payment: pixDireto } as never)
    expect(db.tenantPayment.upsert).not.toHaveBeenCalled()
  })

  it("avisa o financeiro so no PAYMENT_RECEIVED", async () => {
    await processAsaasWebhook("log_1", { event: "PAYMENT_CREATED", payment: pixDireto } as never)
    expect(createNotification).not.toHaveBeenCalled()
    await processAsaasWebhook("log_2", { event: "PAYMENT_RECEIVED", payment: pixDireto } as never)
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createNotification).mock.calls[0][0]).toMatchObject({
      roleTarget: "PMB_FINANCEIRO",
    })
  })
})
