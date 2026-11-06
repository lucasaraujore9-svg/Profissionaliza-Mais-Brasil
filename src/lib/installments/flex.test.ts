import { describe, it, expect } from "vitest"
import {
  buildFlexSchedule,
  flexScheduleError,
  flexTotal,
  flexRowLabel,
  flexPlanSummary,
  flexOffer,
  type FlexPlanState,
  type FlexRowState,
} from "./flex"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const base = {
  count: 3,
  installmentValue: 100,
  downPayment: null as number | null,
  firstDueDate: d("2026-12-10"),
  saleDate: d("2026-11-06"),
}

describe("buildFlexSchedule", () => {
  it("com entrada: linha 1 na venda, parcelas mensais depois", () => {
    expect(buildFlexSchedule({ ...base, downPayment: 250 })).toEqual([
      { number: 1, amount: 250, dueDate: d("2026-11-06") },
      { number: 2, amount: 100, dueDate: d("2026-12-10") },
      { number: 3, amount: 100, dueDate: d("2027-01-10") },
      { number: 4, amount: 100, dueDate: d("2027-02-10") },
    ])
  })
  it("sem entrada: 3 linhas, a 1a em firstDueDate", () => {
    const rows = buildFlexSchedule(base)
    expect(rows).toHaveLength(3)
    expect(rows[0].dueDate).toEqual(d("2026-12-10"))
  })
  it("dia 31 cai no ultimo dia de fevereiro", () => {
    const rows = buildFlexSchedule({ ...base, firstDueDate: d("2027-01-31") })
    expect(rows[1].dueDate).toEqual(d("2027-02-28"))
  })
})

describe("flexScheduleError", () => {
  it("rejeita valores e contagens invalidos", () => {
    expect(flexScheduleError({ ...base, installmentValue: 4.99 })).not.toBeNull()
    expect(flexScheduleError({ ...base, downPayment: 4 })).not.toBeNull()
    expect(flexScheduleError({ ...base, count: 25 })).not.toBeNull()
    expect(flexScheduleError({ ...base, count: 1 })).not.toBeNull()
  })
  it("aceita 1 parcela com entrada e plano normal", () => {
    expect(flexScheduleError({ ...base, count: 1, downPayment: 50 })).toBeNull()
    expect(flexScheduleError(base)).toBeNull()
  })
})

describe("flexTotal", () => {
  it("soma em centavos exatos", () => {
    expect(flexTotal({ count: 3, installmentValue: 100.1, downPayment: 250 })).toBe(550.3)
  })
})

describe("flexRowLabel", () => {
  it("rotulos", () => {
    expect(flexRowLabel({ number: 1 }, true, 4)).toBe("Entrada")
    expect(flexRowLabel({ number: 3 }, true, 4)).toBe("Parcela 2 de 3")
    expect(flexRowLabel({ number: 3 }, false, 3)).toBe("Parcela 3 de 3")
  })
})

describe("flexPlanSummary", () => {
  it("com e sem entrada, com espacos comuns", () => {
    expect(
      flexPlanSummary({ hasDownPayment: true, downPayment: 250, count: 3, installmentValue: 100 }),
    ).toBe("Entrada R$ 250,00 + 3x R$ 100,00 · total R$ 550,00")
    expect(
      flexPlanSummary({ hasDownPayment: false, downPayment: null, count: 3, installmentValue: 100 }),
    ).toBe("3x R$ 100,00 · total R$ 300,00")
  })
})

describe("flexOffer", () => {
  const now = d("2026-11-06")
  const row = (
    number: number,
    status: FlexRowState["status"],
    due: string,
    cardDeclinedAt: Date | null = null,
  ): FlexRowState => ({ number, status, dueDate: d(due), cardDeclinedAt })
  const plan = (p: Partial<FlexPlanState>): FlexPlanState => ({
    hasDownPayment: false,
    method: null,
    subscriptionActive: false,
    rows: [row(1, "SCHEDULED", "2026-11-06"), row(2, "SCHEDULED", "2027-01-10")],
    ...p,
  })
  const all = ["PIX", "BOLETO", "CREDIT_CARD"]

  it("entrada em aberto: tres meios, cartao avulso", () => {
    expect(flexOffer(plan({ hasDownPayment: true, method: "PIX" }), now)).toEqual({
      kind: "pay", rowNumber: 1, methods: all, card: "single",
    })
  })
  it("metodo null: tres meios, cartao assinatura", () => {
    expect(flexOffer(plan({}), now)).toEqual({
      kind: "pay", rowNumber: 1, methods: all, card: "subscription",
    })
  })
  it("PIX e BOLETO: so o escolhido", () => {
    expect(flexOffer(plan({ method: "PIX" }), now)).toEqual({
      kind: "pay", rowNumber: 1, methods: ["PIX"], card: null,
    })
    expect(flexOffer(plan({ method: "BOLETO" }), now)).toEqual({
      kind: "pay", rowNumber: 1, methods: ["BOLETO"], card: null,
    })
  })
  it("cartao em dia: auto", () => {
    const p = plan({
      method: "CREDIT_CARD", subscriptionActive: true,
      rows: [row(1, "PAID", "2026-11-06"), row(2, "SCHEDULED", "2027-01-10")],
    })
    expect(flexOffer(p, now)).toEqual({ kind: "auto", nextDueDate: d("2027-01-10") })
  })
  it("cartao recusado: volta aos tres meios", () => {
    const p = plan({
      method: "CREDIT_CARD", subscriptionActive: true,
      rows: [row(1, "OVERDUE", "2026-11-06", d("2026-11-07"))],
    })
    expect(flexOffer(p, now)).toEqual({
      kind: "pay", rowNumber: 1, methods: all, card: "subscription",
    })
  })
  it("linha futura fora da janela: waiting", () => {
    const p = plan({
      method: "BOLETO",
      rows: [row(1, "PAID", "2026-11-06"), row(2, "SCHEDULED", "2027-01-10")],
    })
    expect(flexOffer(p, now)).toEqual({ kind: "waiting", availableFrom: d("2027-01-03") })
  })
  it("tudo pago: done", () => {
    const p = plan({ rows: [row(1, "PAID", "2026-11-06"), row(2, "CANCELLED", "2027-01-10")] })
    expect(flexOffer(p, now)).toEqual({ kind: "done" })
  })
})
