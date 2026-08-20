import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Parcelas 2..N de uma MENSALIDADE DA UNIDADE parcelada no cartao.
 *
 * Contexto: ao parcelar, criamos um parcelamento no Asaas e REMOVEMOS a
 * cobranca original da assinatura (senao a unidade pagaria duas vezes). Por
 * isso as parcelas chegam ao webhook SEM `subscription` — antes deste
 * roteamento elas caiam no fallback "sem subscription" e a linha em
 * `tenant_payments` ficava congelada no estado gravado na compra.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantPayment: { findFirst: vi.fn(), update: vi.fn() },
    webhookLog: { update: vi.fn(() => ({ catch: () => undefined })) },
  },
}))
vi.mock("./client", () => ({
  getPayment: vi.fn(),
  AsaasApiError: class extends Error {},
}))
vi.mock("@/lib/webhooks/transient", () => ({ isTransientWebhookError: () => false }))
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/auto-block", () => ({
  blockTenantStudents: vi.fn(),
  unblockTenantStudents: vi.fn(),
}))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn() }))
vi.mock("@/lib/installments/settle", () => ({ settleBoletoInstallment: vi.fn() }))
vi.mock("@/lib/pmb-config", () => ({
  pmbPlataformaPolo: () => "__pmb__",
  pmbPlataformaVendedorId: () => "1",
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/referrals/commission", () => ({
  createCommissionForTenantPayment: vi.fn(),
  cancelCommissionForTenantPayment: vi.fn(),
  freezeCommissionForPartialRefund: vi.fn(),
}))
vi.mock("@/lib/referrals/monthly", () => ({ flagMonthlyCommissionForRefund: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { processTenantInstallmentPayment } from "./process"

const findFirst = prisma.tenantPayment.findFirst as unknown as ReturnType<typeof vi.fn>
const update = prisma.tenantPayment.update as unknown as ReturnType<typeof vi.fn>
const notify = createNotification as unknown as ReturnType<typeof vi.fn>

function payment(over: Record<string, unknown> = {}) {
  return {
    id: "pay_2",
    installment: "ins_1",
    value: 209,
    paymentDate: "2026-09-10",
    ...over,
  } as never
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "tp_1",
    tenantId: "t_1",
    status: "CONFIRMED",
    installmentCount: 6,
    paidAt: new Date("2026-01-10T12:00:00Z"),
    installmentPaidIds: ["pay_1"],
    tenant: { name: "Revenda Teste" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue({ installmentPaidIds: ["pay_1", "pay_2"] })
})

describe("processTenantInstallmentPayment", () => {
  it("devolve false quando o pagamento nao pertence a um parcelamento", async () => {
    // Sem isto o branch engoliria cobrancas avulsas que devem seguir para os
    // demais roteamentos (carne de aluno, venda direta PMB).
    const handled = await processTenantInstallmentPayment(
      "log_1",
      "PAYMENT_RECEIVED",
      payment({ installment: null }),
    )
    expect(handled).toBe(false)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("devolve false quando o parcelamento nao e de mensalidade de unidade", async () => {
    findFirst.mockResolvedValue(null)
    const handled = await processTenantInstallmentPayment(
      "log_1",
      "PAYMENT_RECEIVED",
      payment(),
    )
    expect(handled).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it("liquida a parcela acrescentando o id (nao criando linha nova)", async () => {
    // UMA linha representa o parcelamento inteiro: `amount` ja e o valor cheio
    // da mensalidade. Criar linha por parcela multiplicaria a receita por N.
    findFirst.mockResolvedValue(row())
    const handled = await processTenantInstallmentPayment(
      "log_1",
      "PAYMENT_CONFIRMED",
      payment(),
    )
    expect(handled).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    const arg = update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: "tp_1" })
    expect(arg.data.installmentPaidIds).toEqual({ push: "pay_2" })
    expect(arg.data.status).toBe("CONFIRMED")
    // Nao mexe no valor da linha-pai.
    expect(arg.data).not.toHaveProperty("amount")
  })

  it("NAO reescreve o paidAt da linha-pai a cada parcela", async () => {
    // `paidAt` é a COMPETÊNCIA da mensalidade. Reescrever empurrava a data mês
    // a mês: uma mensalidade de janeiro em 6x aparecia como receita de junho
    // nos relatórios (que agrupam por paid_at) e janeiro ficava zerado.
    findFirst.mockResolvedValue(row())
    await processTenantInstallmentPayment("log_1", "PAYMENT_CONFIRMED", payment())
    expect(update.mock.calls[0][0].data).not.toHaveProperty("paidAt")
  })

  it("grava paidAt quando a linha ainda nao tem", async () => {
    findFirst.mockResolvedValue(row({ paidAt: null }))
    await processTenantInstallmentPayment("log_1", "PAYMENT_CONFIRMED", payment())
    expect(update.mock.calls[0][0].data.paidAt).toBeInstanceOf(Date)
  })

  it("re-entrega do Asaas nao conta a mesma parcela duas vezes", async () => {
    // Um contador puro somaria de novo e a linha passaria a exibir "7 de 6".
    findFirst.mockResolvedValue(row({ installmentPaidIds: ["pay_1", "pay_2"] }))
    const handled = await processTenantInstallmentPayment(
      "log_1",
      "PAYMENT_RECEIVED",
      payment(),
    )
    expect(handled).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it("PAYMENT_OVERDUE de parcela alerta o admin e NAO suspende a unidade", async () => {
    // O valor cheio ja foi autorizado no cartao na captura da 1a parcela: uma
    // parcela recusada depois e conciliacao, nao motivo para tirar a vitrine do
    // ar. Suspender aqui derrubaria uma unidade que ja pagou.
    findFirst.mockResolvedValue(row())
    const handled = await processTenantInstallmentPayment(
      "log_1",
      "PAYMENT_OVERDUE",
      payment(),
    )
    expect(handled).toBe(true)
    expect(update).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
    })
  })

  it("evento sem semantica de pagamento nao altera a linha", async () => {
    findFirst.mockResolvedValue(row())
    const handled = await processTenantInstallmentPayment(
      "log_1",
      "PAYMENT_UPDATED",
      payment(),
    )
    expect(handled).toBe(true)
    expect(update).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
