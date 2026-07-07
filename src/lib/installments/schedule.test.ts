import { describe, it, expect } from "vitest"
import {
  buildInstallmentSchedule,
  isWithinRevealWindow,
  isOverdue,
} from "./schedule"

// Núcleo puro do carnê: agenda de parcelas + janela de disponibilidade (7 dias
// antes do vencimento, 1ª sempre) + detecção de atraso.

describe("buildInstallmentSchedule", () => {
  it("gera N parcelas mensais a partir do 1º vencimento", () => {
    const rows = buildInstallmentSchedule({
      count: 3,
      installmentValue: 100,
      firstDueDate: new Date("2026-08-10T12:00:00Z"),
    })
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3])
    expect(rows.every((r) => r.amount === 100)).toBe(true)
    expect(rows[0].dueDate.toISOString().slice(0, 10)).toBe("2026-08-10")
    expect(rows[1].dueDate.toISOString().slice(0, 10)).toBe("2026-09-10")
    expect(rows[2].dueDate.toISOString().slice(0, 10)).toBe("2026-10-10")
  })

  it("clampa o dia em meses mais curtos (31/jan → 28/fev)", () => {
    const rows = buildInstallmentSchedule({
      count: 2,
      installmentValue: 50,
      firstDueDate: new Date("2026-01-31T12:00:00Z"),
    })
    expect(rows[1].dueDate.getUTCMonth()).toBe(1) // fevereiro
    expect(rows[1].dueDate.getUTCDate()).toBeLessThanOrEqual(28)
  })
})

describe("isWithinRevealWindow", () => {
  const due = new Date("2026-08-10T12:00:00Z")

  it("1ª parcela está sempre disponível", () => {
    expect(
      isWithinRevealWindow({ number: 1, dueDate: due }, new Date("2026-01-01T00:00:00Z")),
    ).toBe(true)
  })

  it("parcela futura só aparece dentro de 7 dias do vencimento", () => {
    // 10 dias antes → oculta
    expect(
      isWithinRevealWindow({ number: 2, dueDate: due }, new Date("2026-07-31T12:00:00Z")),
    ).toBe(false)
    // 7 dias antes → aparece
    expect(
      isWithinRevealWindow({ number: 2, dueDate: due }, new Date("2026-08-03T12:00:00Z")),
    ).toBe(true)
    // no vencimento → aparece
    expect(
      isWithinRevealWindow({ number: 2, dueDate: due }, new Date("2026-08-10T12:00:00Z")),
    ).toBe(true)
  })
})

describe("isOverdue", () => {
  const due = new Date("2026-08-10T12:00:00Z")

  it("não vence antes do fim do dia do vencimento", () => {
    expect(isOverdue({ dueDate: due, status: "GENERATED" }, new Date("2026-08-10T15:00:00Z"))).toBe(false)
  })

  it("vence após o fim do dia do vencimento", () => {
    expect(isOverdue({ dueDate: due, status: "GENERATED" }, new Date("2026-08-11T00:00:01Z"))).toBe(true)
  })

  it("parcela paga ou cancelada nunca está vencida", () => {
    const later = new Date("2027-01-01T00:00:00Z")
    expect(isOverdue({ dueDate: due, status: "PAID" }, later)).toBe(false)
    expect(isOverdue({ dueDate: due, status: "CANCELLED" }, later)).toBe(false)
  })
})
