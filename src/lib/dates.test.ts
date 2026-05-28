import { describe, it, expect } from "vitest"
import { addMonthsClamped } from "./dates"

// Protege R7: o cálculo de vencimento da inadimplência não pode usar setMonth
// nativo (overflow), senão o bloqueio atrasa ~1 mês para dias 29-31.
describe("addMonthsClamped", () => {
  it("soma meses preservando o dia quando válido", () => {
    const r = addMonthsClamped(new Date(2026, 0, 15), 1)
    expect(r.getMonth()).toBe(1) // fevereiro
    expect(r.getDate()).toBe(15)
  })

  it("clampa 31/jan + 1 mês para o último dia de fevereiro (não overflow p/ março)", () => {
    const r = addMonthsClamped(new Date(2026, 0, 31), 1)
    expect(r.getMonth()).toBe(1) // fevereiro, NÃO março
    expect(r.getDate()).toBe(28) // 2026 não é bissexto
  })

  it("clampa 31/jan + 1 mês em ano bissexto para 29/fev", () => {
    const r = addMonthsClamped(new Date(2024, 0, 31), 1)
    expect(r.getMonth()).toBe(1)
    expect(r.getDate()).toBe(29)
  })

  it("avança de ano corretamente", () => {
    const r = addMonthsClamped(new Date(2026, 10, 30), 3) // nov -> fev
    expect(r.getFullYear()).toBe(2027)
    expect(r.getMonth()).toBe(1)
    expect(r.getDate()).toBe(28)
  })

  it("months=0 retorna a mesma data", () => {
    const base = new Date(2026, 5, 10)
    expect(addMonthsClamped(base, 0).getTime()).toBe(base.getTime())
  })
})
