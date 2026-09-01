import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * O que este arquivo protege: o webhook PAYMENT_DELETED é o que fecha o ciclo
 * "Cancelar cobrança" (DELETING → DELETED) e o que tira do banco a mensalidade
 * apagada no Asaas por fora.
 *
 * A armadilha: o DELETE do Asaas é um SOFT DELETE. A cobrança removida segue
 * respondendo 200 em GET /payments/{id} — existe até um POST .../restore para
 * desfazer — e MANTÉM o último `status` (PENDING/OVERDUE). "Removida" não é um
 * valor de `status`; quem responde é o campo `deleted`.
 *
 * A primeira versão desta função exigia 404 como prova de remoção e, por isso,
 * ignorou TODOS os eventos que já chegaram, sem uma única confirmação em
 * produção. Os testes abaixo travam as duas provas válidas (`deleted: true` e
 * 404) e o caso espúrio que deve continuar sendo ignorado.
 */

const db = vi.hoisted(() => ({
  tenantPayment: { findUnique: vi.fn(), update: vi.fn() },
  webhookLog: { update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const asaas = vi.hoisted(() => {
  class AsaasApiError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return { getPayment: vi.fn(), AsaasApiError }
})
vi.mock("./client", () => asaas)

// Dependências que o módulo carrega mas que este caminho não exercita: o
// handler de PAYMENT_DELETED é tratado ANTES de qualquer roteamento.
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/auto-block", () => ({
  blockTenantStudents: vi.fn(),
  unblockTenantStudents: vi.fn(),
}))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn() }))
vi.mock("@/lib/installments/settle", () => ({ settleBoletoInstallment: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/referrals/commission", () => ({
  accrueReferralCommission: vi.fn(),
  reverseReferralCommission: vi.fn(),
  recordTenantPaymentForCommission: vi.fn(),
}))
vi.mock("@/lib/referrals/monthly", () => ({ flagMonthlyCommissionForRefund: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/course-authoring/split-webhook", () => ({
  applySplitEvent: vi.fn(),
  isSplitEvent: () => false,
  splitIdFromPayload: () => null,
}))
vi.mock("@/lib/subscriptions/renew", () => ({
  ensureSubscriptionForTenant: vi.fn(),
  renewTenantSubscription: vi.fn(),
  syncSubscriptionFromPayment: vi.fn(),
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})

import { processAsaasWebhook } from "./process"

const LOG_ID = "log_1"
const PAYMENT_ID = "pay_ksxz2mxcbv8jrxsz"

/** Corpo do webhook. `deleted` aqui é do REMETENTE — nunca é a prova usada. */
function evento(bodyDeleted = true) {
  return {
    event: "PAYMENT_DELETED",
    payment: { id: PAYMENT_ID, deleted: bodyDeleted },
  } as never
}

/** A última nota gravada no WebhookLog — é onde o desfecho fica registrado. */
function nota(): string {
  const calls = db.webhookLog.update.mock.calls as { where: unknown; data: { error?: string } }[][]
  const last = calls[calls.length - 1]?.[0] as { data: { error?: string } } | undefined
  return last?.data?.error ?? ""
}

beforeEach(() => {
  vi.clearAllMocks()
  db.webhookLog.update.mockResolvedValue({})
  db.tenantPayment.update.mockResolvedValue({})
  db.tenantPayment.findUnique.mockResolvedValue({ id: "tp1", tenantId: "t1", paidAt: null, markedPaidAt: null })
})

describe("PAYMENT_DELETED — a prova de que a cobrança sumiu", () => {
  it("confirma pelo `deleted` do Asaas mesmo com o status ainda em PENDING", async () => {
    // O par exato que chega em produção: soft delete mantém o status antigo.
    asaas.getPayment.mockResolvedValue({ id: PAYMENT_ID, status: "PENDING", deleted: true })

    await processAsaasWebhook(LOG_ID, evento())

    expect(db.tenantPayment.update).toHaveBeenCalledWith({
      where: { asaasPaymentId: PAYMENT_ID },
      data: { status: "DELETED" },
    })
    expect(nota()).toContain("confirmado")
  })

  it("aceita o 404 como prova — id que não resolve na conta", async () => {
    asaas.getPayment.mockRejectedValue(new asaas.AsaasApiError("not found", 404))

    await processAsaasWebhook(LOG_ID, evento())

    expect(db.tenantPayment.update).toHaveBeenCalledWith({
      where: { asaasPaymentId: PAYMENT_ID },
      data: { status: "DELETED" },
    })
  })

  it("ignora o evento cuja cobrança NÃO está removida no Asaas", async () => {
    asaas.getPayment.mockResolvedValue({ id: PAYMENT_ID, status: "PENDING", deleted: false })

    await processAsaasWebhook(LOG_ID, evento())

    expect(db.tenantPayment.update).not.toHaveBeenCalled()
    expect(nota()).toContain("não está removida")
  })

  it("não confia no corpo do webhook: `deleted: true` forjado não vira escrita", async () => {
    // Defesa em profundidade — a mesma do resto do arquivo. Quem decide é a
    // re-busca na conta da PMB, não o remetente.
    asaas.getPayment.mockResolvedValue({ id: PAYMENT_ID, status: "PENDING", deleted: false })

    await processAsaasWebhook(LOG_ID, evento(true))

    expect(db.tenantPayment.update).not.toHaveBeenCalled()
  })

  // Caso real de produção: cobrança removida e, no mesmo dia, restaurada e
  // paga. `paidAt` sobrevive à reescrita de status; `status` não. Marcar
  // DELETED aqui apagaria receita real do extrato e da comissão.
  it("nunca apaga mensalidade com pagamento registrado", async () => {
    asaas.getPayment.mockResolvedValue({ id: PAYMENT_ID, status: "PENDING", deleted: true })
    db.tenantPayment.findUnique.mockResolvedValue({
      id: "tp1",
      tenantId: "t1",
      paidAt: new Date("2026-08-25"),
      markedPaidAt: null,
    })

    await processAsaasWebhook(LOG_ID, evento())

    expect(db.tenantPayment.update).not.toHaveBeenCalled()
    expect(nota()).toContain("pagamento registrado")
  })

  it("nunca apaga mensalidade quitada na mão (markedPaidAt)", async () => {
    asaas.getPayment.mockResolvedValue({ id: PAYMENT_ID, status: "PENDING", deleted: true })
    db.tenantPayment.findUnique.mockResolvedValue({
      id: "tp1",
      tenantId: "t1",
      paidAt: null,
      markedPaidAt: new Date("2026-08-25"),
    })

    await processAsaasWebhook(LOG_ID, evento())

    expect(db.tenantPayment.update).not.toHaveBeenCalled()
  })

  it("não escreve quando não há mensalidade correspondente no banco", async () => {
    asaas.getPayment.mockResolvedValue({ id: PAYMENT_ID, status: "PENDING", deleted: true })
    db.tenantPayment.findUnique.mockResolvedValue(null)

    await processAsaasWebhook(LOG_ID, evento())

    expect(db.tenantPayment.update).not.toHaveBeenCalled()
    expect(nota()).toContain("sem TenantPayment")
  })
})
