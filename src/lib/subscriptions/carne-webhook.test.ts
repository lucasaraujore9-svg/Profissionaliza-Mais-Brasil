import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Boleto da assinatura no boleto, no webhook do Mercado Pago.
 *
 * O caso que motivou a rota própria: no MP o boleto que vence sem pagamento
 * chega como `cancelled`, e o tratamento de assinatura lê `cancelled` como
 * ESTORNO — revogaria os cursos (e, na plataforma legada, apagaria o progresso)
 * de quem só atrasou um boleto.
 */

const db = vi.hoisted(() => ({
  subscriptionPayment: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})
vi.mock("@/lib/mercadopago/client", () => ({ cancelPayment: vi.fn(async () => ({})) }))
vi.mock("./renew", () => ({
  settleSubscriptionCycle: vi.fn(async () => ({ settled: true })),
  revokeSubscriptionForRefund: vi.fn(async () => undefined),
}))

import { cancelPayment } from "@/lib/mercadopago/client"
import { revokeSubscriptionForRefund, settleSubscriptionCycle } from "./renew"
import { handleMpCarnePayment, isMpCarneReference } from "./carne-webhook"

const settle = settleSubscriptionCycle as unknown as ReturnType<typeof vi.fn>
const revoke = revokeSubscriptionForRefund as unknown as ReturnType<typeof vi.fn>
const cancelMp = cancelPayment as unknown as ReturnType<typeof vi.fn>

const DUE = new Date("2026-10-10T12:00:00Z")
const tenant = { id: "ten_1" }

function row(over: Record<string, unknown> = {}) {
  return {
    id: "row_1",
    subscriptionId: "sub_1",
    tenantId: "ten_1",
    number: 2,
    dueDate: DUE,
    paidAt: null,
    status: "PENDING",
    mpPaymentId: "9001",
    ...over,
  }
}

function payment(over: Record<string, unknown> = {}) {
  return {
    id: 9001,
    status: "approved",
    external_reference: "subbol_row_1",
    transaction_amount: 59.9,
    date_approved: "2026-10-09T15:00:00.000Z",
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  db.subscriptionPayment.findUnique.mockResolvedValue(row())
})

describe("handleMpCarnePayment", () => {
  it("reconhece só a referência do carnê de assinatura", () => {
    expect(isMpCarneReference("subbol_x")).toBe(true)
    expect(isMpCarneReference("pmb_sub_x")).toBe(false)
    expect(isMpCarneReference("parc_x")).toBe(false)
    expect(isMpCarneReference(null)).toBe(false)
  })

  it("boleto pago liquida o ciclo com o vencimento da AGENDA", async () => {
    const r = await handleMpCarnePayment(tenant, "tok", payment())
    expect(r.ok).toBe(true)
    expect(settle).toHaveBeenCalledWith("sub_1", {
      gateway: "MP",
      externalPaymentId: "9001",
      amount: 59.9,
      paidAt: new Date("2026-10-09T15:00:00.000Z"),
      dueDate: DUE,
      billingType: "BOLETO",
    })
  })

  it("boleto VENCIDO (cancelled) não revoga nada — libera a linha para reemissão", async () => {
    const r = await handleMpCarnePayment(tenant, "tok", payment({ status: "cancelled" }))
    expect(r.ok).toBe(true)
    expect(revoke).not.toHaveBeenCalled()
    expect(settle).not.toHaveBeenCalled()
    expect(db.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: { status: "OVERDUE", mpPaymentId: null, bankSlipUrl: null, digitableLine: null },
    })
  })

  it("cancelamento feito por nós (linha já cancelada) não reabre a linha", async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue(row({ status: "CANCELLED" }))
    await handleMpCarnePayment(tenant, "tok", payment({ status: "cancelled" }))
    expect(db.subscriptionPayment.update).not.toHaveBeenCalled()
  })

  it("aviso atrasado de um boleto ANTIGO não mexe no boleto novo", async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue(row({ mpPaymentId: "9002" }))
    await handleMpCarnePayment(tenant, "tok", payment({ status: "cancelled" }))
    expect(db.subscriptionPayment.update).not.toHaveBeenCalled()
  })

  it("pagaram o boleto antigo depois da reemissão: ele vale e o novo é cancelado", async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue(row({ mpPaymentId: "9002" }))
    await handleMpCarnePayment(tenant, "tok", payment())
    expect(db.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: { mpPaymentId: "9001" },
    })
    expect(cancelMp).toHaveBeenCalledWith("tok", "9002")
    expect(settle.mock.calls[0][1].externalPaymentId).toBe("9001")
  })

  it("estorno de verdade revoga, sem carência", async () => {
    await handleMpCarnePayment(tenant, "tok", payment({ status: "refunded" }))
    expect(revoke).toHaveBeenCalledWith("sub_1")
  })

  it("boleto de outra unidade é recusado", async () => {
    const r = await handleMpCarnePayment({ id: "ten_2" }, "tok", payment())
    expect(r.ok).toBe(false)
    expect(settle).not.toHaveBeenCalled()
  })

  it("vitrine PMB só alcança boleto sem unidade", async () => {
    const r = await handleMpCarnePayment({ id: "__pmb__", isPmbVitrine: true }, "tok", payment())
    expect(r.ok).toBe(false)
  })

  it("boleto emitido aguardando pagamento só registra", async () => {
    const r = await handleMpCarnePayment(tenant, "tok", payment({ status: "pending" }))
    expect(r.ok).toBe(true)
    expect(settle).not.toHaveBeenCalled()
    expect(db.subscriptionPayment.update).not.toHaveBeenCalled()
  })
})
