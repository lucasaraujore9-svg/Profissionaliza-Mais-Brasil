import { describe, expect, it } from "vitest"
import {
  MAX_CARD_INSTALLMENTS,
  displayInterestFreeInstallments,
  interestFreeLabel,
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

describe("interestFreeLabel", () => {
  it("rotula em 'Nx sem juros' quando há parcelas sem juros", () => {
    expect(interestFreeLabel(6)).toBe("6x sem juros")
    expect(interestFreeLabel(12)).toBe("12x sem juros")
  })

  it("retorna null quando só há à vista", () => {
    expect(interestFreeLabel(1)).toBeNull()
    expect(interestFreeLabel(null)).toBeNull()
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
