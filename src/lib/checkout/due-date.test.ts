import { describe, it, expect } from "vitest"
import { dueDateInDays } from "./due-date"

// Protege contra regressão do bug de timezone: a aritmética deve ser em UTC
// (getUTCDate/setUTCDate) para casar com toISOString() — senão dá off-by-one
// perto da meia-noite em servidores fora de UTC.
describe("dueDateInDays", () => {
  it("retorna formato YYYY-MM-DD", () => {
    expect(dueDateInDays(3)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("days=0 retorna a data UTC de hoje", () => {
    const todayUtc = new Date().toISOString().slice(0, 10)
    expect(dueDateInDays(0)).toBe(todayUtc)
  })

  it("soma os dias em UTC de forma consistente", () => {
    const expected = new Date()
    expected.setUTCDate(expected.getUTCDate() + 7)
    expect(dueDateInDays(7)).toBe(expected.toISOString().slice(0, 10))
  })
})
