import { describe, expect, it } from "vitest"
import {
  perInstallment,
  pmbMaxBoletoInstallments,
  pmbMaxCardInstallments,
} from "./pmb-rules"

describe("pmbMaxBoletoInstallments", () => {
  it("abaixo de R$100 só permite à vista (parcela mínima R$50)", () => {
    expect(pmbMaxBoletoInstallments(49.9)).toBe(1)
    expect(pmbMaxBoletoInstallments(99.99)).toBe(1)
  })

  it("R$100 permite exatamente 2 boletos de R$50", () => {
    expect(pmbMaxBoletoInstallments(100)).toBe(2)
  })

  it("cresce com o valor até o teto de 6 boletos", () => {
    expect(pmbMaxBoletoInstallments(249.99)).toBe(4)
    expect(pmbMaxBoletoInstallments(250)).toBe(5)
    expect(pmbMaxBoletoInstallments(300)).toBe(6)
  })

  it("R$1.000 trava no teto de 6 (não 20)", () => {
    expect(pmbMaxBoletoInstallments(1000)).toBe(6)
  })

  it("valores inválidos caem em 1 (à vista)", () => {
    expect(pmbMaxBoletoInstallments(0)).toBe(1)
    expect(pmbMaxBoletoInstallments(-10)).toBe(1)
    expect(pmbMaxBoletoInstallments(Number.NaN)).toBe(1)
  })
})

describe("pmbMaxCardInstallments", () => {
  it("sempre oferece até 12x, independente da config do admin", () => {
    expect(pmbMaxCardInstallments(1000)).toBe(12)
    expect(pmbMaxCardInstallments(60)).toBe(12)
  })

  it("parcela mínima de R$5 limita valores baixos", () => {
    expect(pmbMaxCardInstallments(20)).toBe(4)
    expect(pmbMaxCardInstallments(59.99)).toBe(11)
    expect(pmbMaxCardInstallments(4.99)).toBe(1)
  })

  it("valores inválidos caem em 1 (à vista)", () => {
    expect(pmbMaxCardInstallments(0)).toBe(1)
    expect(pmbMaxCardInstallments(-10)).toBe(1)
    expect(pmbMaxCardInstallments(Number.NaN)).toBe(1)
  })
})

describe("perInstallment", () => {
  it("divide com arredondamento de 2 casas", () => {
    expect(perInstallment(100, 2)).toBe(50)
    expect(perInstallment(1000, 6)).toBe(166.67)
    expect(perInstallment(299.9, 3)).toBe(99.97)
  })

  it("n=1 devolve o total", () => {
    expect(perInstallment(123.45, 1)).toBe(123.45)
  })
})
