import { describe, it, expect } from "vitest"
import {
  isExternalPaymentId,
  nextDueAfterExternal,
  nextMpBoletoDueAfterExternal,
  recurringStart,
  type RecurringSetupSource,
} from "./external-first-payment"

const NOW = new Date("2026-10-29T15:00:00Z")

describe("vencimento da 2ª mensalidade", () => {
  it("um mês depois do pagamento no marketplace", () => {
    expect(nextDueAfterExternal(new Date("2026-10-20T12:00:00Z"), NOW).toISOString().slice(0, 10))
      .toBe("2026-11-20")
  })

  it("31/jan vira o último dia de fevereiro", () => {
    const now = new Date("2026-02-01T15:00:00Z")
    expect(nextDueAfterExternal(new Date("2026-01-31T12:00:00Z"), now).toISOString().slice(0, 10))
      .toBe("2026-02-28")
  })

  it("venda cadastrada com atraso: nunca vence no passado", () => {
    const paid = new Date("2026-08-01T12:00:00Z")
    expect(nextDueAfterExternal(paid, NOW).toISOString().slice(0, 10)).toBe("2026-10-29")
    // Boleto do MP não nasce vencendo hoje.
    expect(nextMpBoletoDueAfterExternal(paid, NOW).toISOString().slice(0, 10)).toBe("2026-11-01")
  })
})

describe("recurringStart", () => {
  const base: RecurringSetupSource = {
    paymentType: "MONTHLY",
    gateway: "ASAAS",
    status: "ACTIVE",
    finalAmount: 99,
    installmentsPaid: 1,
    installmentsTotal: 12,
    asaasSubscriptionId: null,
    externalPaidAt: new Date("2026-10-20T12:00:00Z"),
  }

  it("cobra só o que falta, a partir do mês seguinte", () => {
    expect(recurringStart(base, NOW)).toEqual({ nextDueDate: "2026-11-20", remaining: 11 })
  })

  it("não reabre o checkout fora do caso marketplace", () => {
    // Sem baixa externa: é uma mensal comum já paga pelo gateway.
    expect(recurringStart({ ...base, externalPaidAt: null }, NOW)).toBeNull()
    // Assinatura já cadastrada.
    expect(recurringStart({ ...base, asaasSubscriptionId: "sub_1" }, NOW)).toBeNull()
    // Carnê MP: as próximas o sistema emite, não há o que cadastrar.
    expect(recurringStart({ ...base, gateway: "MP" }, NOW)).toBeNull()
    expect(recurringStart({ ...base, status: "CANCELLED" }, NOW)).toBeNull()
    expect(recurringStart({ ...base, installmentsPaid: 12 }, NOW)).toBeNull()
  })

  it("reconhece o id da baixa externa", () => {
    expect(isExternalPaymentId("ext_abc")).toBe(true)
    expect(isExternalPaymentId("pay_123")).toBe(false)
    expect(isExternalPaymentId(null)).toBe(false)
  })
})
