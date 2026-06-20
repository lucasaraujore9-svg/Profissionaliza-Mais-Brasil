import { describe, it, expect } from "vitest"
import { computeAvailableAt } from "./commission"

describe("computeAvailableAt (QA-004)", () => {
  it("retorna o payoutDay do mês seguinte ao pagamento", () => {
    expect(computeAvailableAt(new Date("2026-01-10T12:00:00Z"), 20).toISOString()).toBe(
      "2026-02-20T00:00:00.000Z",
    )
  })
  it("evita overflow: pago em 31/jan + payoutDay 20 → 20/fev (não pula para março)", () => {
    expect(computeAvailableAt(new Date("2026-01-31T23:59:00Z"), 20).toISOString()).toBe(
      "2026-02-20T00:00:00.000Z",
    )
  })
  it("payoutDay além do último dia do mês curto é truncado (fev 2026 = 28d)", () => {
    expect(computeAvailableAt(new Date("2026-01-15T00:00:00Z"), 30).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    )
  })
  it("virada de ano: pago em dez → payoutDay de jan do ano seguinte", () => {
    expect(computeAvailableAt(new Date("2026-12-05T00:00:00Z"), 20).toISOString()).toBe(
      "2027-01-20T00:00:00.000Z",
    )
  })
})
