import { describe, expect, it } from "vitest"
import { defaultFirstDueDate, flexSaleDefaults, flexSaleInput, parseBrl } from "./flex-sale-fields"

// 06/11/2026 às 23h30 em Brasília = 07/11 02h30 UTC: o dia que vale é o de Brasília.
const NOW = new Date("2026-11-07T02:30:00Z")

describe("parseBrl", () => {
  it("aceita vírgula decimal, milhar com ponto e ponto decimal sem vírgula", () => {
    expect(parseBrl("89,90")).toBe(89.9)
    expect(parseBrl("1.234,56")).toBe(1234.56)
    expect(parseBrl("89.90")).toBe(89.9)
    expect(parseBrl("")).toBe(0)
    expect(parseBrl("abc")).toBe(0)
  })

  it("ponto de milhar sem vírgula é milhar, não decimal (F2)", () => {
    expect(parseBrl("10.000")).toBe(10000)
    expect(parseBrl("1.500")).toBe(1500)
    expect(parseBrl("1.234.567")).toBe(1234567)
    expect(parseBrl("10,50")).toBe(10.5)
    expect(parseBrl("10.5")).toBe(10.5)
    expect(parseBrl("1.234,56")).toBe(1234.56)
  })
})

describe("venda parcelada no formulário", () => {
  it("1º vencimento padrão é hoje + 1 mês no dia de Brasília", () => {
    expect(defaultFirstDueDate(NOW)).toBe("2026-12-06")
  })

  it("curso mensal abre com os meses e a mensalidade", () => {
    const s = flexSaleDefaults({ months: 3, value: 53 }, NOW)
    expect(s).toMatchObject({ count: 3, value: "53,00", hasDownPayment: false })
    const r = flexSaleInput(s, NOW)
    expect(r.error).toBeNull()
    expect(r.total).toBe(159)
    expect(r.parcelado).toEqual({
      count: 3,
      installmentValue: 53,
      downPayment: null,
      firstDueDate: "2026-12-06",
    })
  })

  it("entrada entra no corpo e no total; desmarcada vira null", () => {
    const base = { ...flexSaleDefaults(null, NOW), count: 4, value: "50", downPayment: "100,00" }
    const com = flexSaleInput({ ...base, hasDownPayment: true }, NOW)
    expect(com.parcelado.downPayment).toBe(100)
    expect(com.total).toBe(300)
    expect(com.summary).toContain("Entrada")
    expect(flexSaleInput({ ...base, hasDownPayment: false }, NOW).parcelado.downPayment).toBeNull()
  })

  it("valida com as regras do servidor", () => {
    const s = flexSaleDefaults(null, NOW)
    expect(flexSaleInput({ ...s, value: "50", count: 1 }, NOW).error).toMatch(/pelo menos 2/)
    expect(flexSaleInput({ ...s, value: "", count: 2 }, NOW).error).toMatch(/parcela/)
    expect(
      flexSaleInput({ ...s, value: "50", firstDueDate: "2026-11-05" }, NOW).error,
    ).toMatch(/1º vencimento/)
    expect(flexSaleInput({ ...s, value: "50", firstDueDate: "2026-11-06" }, NOW).error).toBeNull()
  })
})
