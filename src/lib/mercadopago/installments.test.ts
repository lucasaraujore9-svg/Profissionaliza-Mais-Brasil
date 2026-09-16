import { describe, expect, it } from "vitest"
import {
  MAX_CARD_INSTALLMENTS,
  displayInterestFreeInstallments,
  interestFreeInstallmentsFor,
  interestFreeInstallmentText,
  interestFreePhrase,
} from "./installments"

describe("displayInterestFreeInstallments", () => {
  it("retorna null para à vista (1), zero, nulo ou inválido", () => {
    expect(displayInterestFreeInstallments(1)).toBeNull()
    expect(displayInterestFreeInstallments(0)).toBeNull()
    expect(displayInterestFreeInstallments(null)).toBeNull()
    expect(displayInterestFreeInstallments(undefined)).toBeNull()
    expect(displayInterestFreeInstallments(Number.NaN)).toBeNull()
  })

  it("retorna o número quando >= 2", () => {
    expect(displayInterestFreeInstallments(2)).toBe(2)
    expect(displayInterestFreeInstallments(6)).toBe(6)
  })

  it("nunca passa do teto de 12x", () => {
    expect(displayInterestFreeInstallments(24)).toBe(MAX_CARD_INSTALLMENTS)
  })
})

describe("interestFreeInstallmentsFor", () => {
  it("usa o nº configurado quando cada parcela passa de R$ 5", () => {
    expect(interestFreeInstallmentsFor(100, 10)).toBe(10)
    expect(interestFreeInstallmentsFor(1000, 12)).toBe(12)
  })

  it("limita pela parcela mínima de R$ 5", () => {
    // 4x de R$ 19,90 daria R$ 4,97.
    expect(interestFreeInstallmentsFor(19.9, 10)).toBe(3)
    expect(interestFreeInstallmentsFor(50, 12)).toBe(10)
  })

  it("sem espaço para 2 parcelas, não há parcelamento", () => {
    expect(interestFreeInstallmentsFor(9.99, 10)).toBeNull()
    expect(interestFreeInstallmentsFor(100, 1)).toBeNull()
    expect(interestFreeInstallmentsFor(0, 10)).toBeNull()
  })
})

describe("interestFreeInstallmentText", () => {
  // O Intl separa "R$" do número com espaço não quebrável; normaliza para ler.
  const text = (price: number, n: number | null | undefined) =>
    interestFreeInstallmentText(price, n)?.replace(/\u00a0/g, " ") ?? null

  it("divide o preço pelo nº de parcelas sem juros da unidade", () => {
    // O caso do pedido: curso de R$ 100, até 10x sem juros.
    expect(text(100, 10)).toBe("10x de R$ 10,00 sem juros")
    expect(text(497, 4)).toBe("4x de R$ 124,25 sem juros")
  })

  it("arredonda a parcela ao centavo", () => {
    expect(text(100, 3)).toBe("3x de R$ 33,33 sem juros")
    expect(text(199.9, 12)).toBe("12x de R$ 16,66 sem juros")
  })

  it("não anuncia parcela quando só há à vista", () => {
    expect(text(100, 1)).toBeNull()
    expect(text(100, 0)).toBeNull()
    expect(text(100, null)).toBeNull()
    expect(text(100, undefined)).toBeNull()
  })

  it("não anuncia parcela abaixo do mínimo de R$ 5", () => {
    expect(text(19.9, 10)).toBe("3x de R$ 6,63 sem juros")
  })

  it("não anuncia parcela de preço zerado ou inválido", () => {
    expect(text(0, 10)).toBeNull()
    expect(text(-5, 10)).toBeNull()
    expect(text(Number.NaN, 10)).toBeNull()
  })

  it("nunca passa do teto do checkout", () => {
    expect(text(240, 24)).toBe(`${MAX_CARD_INSTALLMENTS}x de R$ 20,00 sem juros`)
  })
})

describe("interestFreePhrase", () => {
  it("usa o número configurado pela unidade (>=2)", () => {
    expect(interestFreePhrase(6)).toBe("Até 6x sem juros")
    expect(interestFreePhrase(12)).toBe("Até 12x sem juros")
    expect(interestFreePhrase(24)).toBe(`Até ${MAX_CARD_INSTALLMENTS}x sem juros`)
  })

  it("sem parcela sem juros (1/0/nulo) não alega sem juros", () => {
    expect(interestFreePhrase(1)).toBe("Parcelado no cartão")
    expect(interestFreePhrase(0)).toBe("Parcelado no cartão")
    expect(interestFreePhrase(null)).toBe("Parcelado no cartão")
    expect(interestFreePhrase(undefined)).toBe("Parcelado no cartão")
  })
})
