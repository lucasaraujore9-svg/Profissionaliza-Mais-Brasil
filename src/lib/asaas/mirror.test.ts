import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * Espelho das faturas da unidade (Asaas -> banco). Regra do dono, 26/10/2026:
 * o que acontece com a fatura direto no Asaas (baixa, cancelamento, edicao)
 * aparece no PMB como historico, e a fatura NUNCA some do PMB.
 */

const db = vi.hoisted(() => ({
  tenantPayment: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("./client", () => ({ listPayments: vi.fn() }))
vi.mock("@/lib/webhooks-saida/unidade", () => ({ emitUnidadePagamento: vi.fn() }))

import { mirrorAsaasPayments, markRemovedInAsaas } from "./reconcile"
import type { AsaasPayment } from "./types"

const due = new Date("2026-10-26T00:00:00.000Z")

function asaasPay(over: Partial<AsaasPayment> = {}): AsaasPayment {
  return {
    id: "pay_1",
    customer: "cus_1",
    subscription: "sub_1",
    installment: null,
    billingType: "PIX",
    value: 239,
    netValue: 237,
    status: "PENDING",
    deleted: false,
    dueDate: "2026-10-26",
    paymentDate: null,
    clientPaymentDate: null,
    invoiceUrl: "https://x",
    bankSlipUrl: null,
    ...over,
  } as AsaasPayment
}

function local(over: Record<string, unknown> = {}) {
  return {
    id: "local-1",
    tenantId: "t1",
    asaasPaymentId: "pay_1",
    status: "PENDING",
    amount: 239,
    billingType: "PIX",
    dueDate: due,
    paidAt: null,
    markedPaidAt: null,
    refundedAt: null,
    notes: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.tenantPayment.findMany.mockResolvedValue([])
  db.tenantPayment.upsert.mockImplementation(async (args: { update: { notes?: string } }) => ({
    id: "local-1",
    notes: args.update.notes ?? null,
  }))
  db.tenantPayment.update.mockResolvedValue({})
})

describe("mirrorAsaasPayments", () => {
  it("fatura que so existia no Asaas ganha linha no banco e devolve o id local", async () => {
    const { rows } = await mirrorAsaasPayments("t1", [asaasPay()], "admin")
    expect(db.tenantPayment.upsert).toHaveBeenCalledTimes(1)
    expect(rows.get("pay_1")?.id).toBe("local-1")
  })

  it("baixa manual do PMB nunca e reescrita pelo status do Asaas", async () => {
    db.tenantPayment.findMany.mockResolvedValue([local({ status: "RECEIVED", markedPaidAt: due })])
    const { rows } = await mirrorAsaasPayments("t1", [asaasPay({ status: "PENDING" })], "cron")
    expect(db.tenantPayment.upsert).not.toHaveBeenCalled()
    expect(rows.get("pay_1")).toEqual({ id: "local-1", notes: null, locked: true })
  })

  it("cobranca espelhada em OUTRA unidade nao e tocada", async () => {
    db.tenantPayment.findMany.mockResolvedValue([local({ tenantId: "t2" })])
    const { rows } = await mirrorAsaasPayments("t1", [asaasPay()], "cron")
    expect(db.tenantPayment.upsert).not.toHaveBeenCalled()
    expect(rows.has("pay_1")).toBe(false)
  })

  it("baixa em dinheiro e edicao feitas no Asaas viram historico", async () => {
    db.tenantPayment.findMany.mockResolvedValue([local()])
    await mirrorAsaasPayments(
      "t1",
      [asaasPay({ status: "RECEIVED_IN_CASH", value: 200, dueDate: "2026-10-30", paymentDate: "2026-10-26" })],
      "cron",
    )
    const notes = db.tenantPayment.upsert.mock.calls[0][0].update.notes as string
    expect(notes).toContain("Baixa dada direto no Asaas")
    expect(notes).toContain("Valor alterado direto no Asaas: R$ 239,00 → R$ 200,00")
    expect(notes).toContain("Vencimento alterado direto no Asaas: 26/10/2026 → 30/10/2026")
  })

  it("nada mudou: nao escreve", async () => {
    db.tenantPayment.findMany.mockResolvedValue([local()])
    await mirrorAsaasPayments("t1", [asaasPay()], "admin")
    expect(db.tenantPayment.upsert).not.toHaveBeenCalled()
  })
})

describe("markRemovedInAsaas", () => {
  it("marca DELETED (nunca apaga); so anota quem foi cancelado fora do PMB", async () => {
    const notes = await markRemovedInAsaas([
      { id: "a", status: "PENDING", notes: null },
      { id: "b", status: "DELETING", notes: "[x] Cancelada no PMB por Ana." },
    ])
    const calls = db.tenantPayment.update.mock.calls.map((c) => c[0])
    expect(calls).toEqual([
      { where: { id: "a" }, data: { status: "DELETED", notes: expect.stringContaining("Cancelada direto no Asaas.") } },
      { where: { id: "b" }, data: { status: "DELETED", notes: "[x] Cancelada no PMB por Ana." } },
    ])
    expect(notes.get("b")).toBe("[x] Cancelada no PMB por Ana.")
  })
})
