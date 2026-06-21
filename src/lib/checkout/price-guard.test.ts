import { describe, it, expect } from "vitest"
import { isSellablePrice } from "./price-guard"

// SAAS-004: o checkout da vitrine não pode vender curso com preço <= 0.
// Esta é a invariante pura por trás do gate `price: { gt: 0 }` da query e da
// trava explícita no caminho de receita (loja/checkout).

describe("isSellablePrice", () => {
  it("aceita preço positivo", () => {
    expect(isSellablePrice(1)).toBe(true)
    expect(isSellablePrice(0.01)).toBe(true)
    expect(isSellablePrice(209)).toBe(true)
  })

  it("rejeita preço zero (curso sem valor não vende)", () => {
    expect(isSellablePrice(0)).toBe(false)
  })

  it("rejeita preço negativo", () => {
    expect(isSellablePrice(-1)).toBe(false)
    expect(isSellablePrice(-0.01)).toBe(false)
  })

  it("rejeita NaN (Decimal mal convertido)", () => {
    expect(isSellablePrice(Number.NaN)).toBe(false)
  })

  it("rejeita Infinity", () => {
    expect(isSellablePrice(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it("rejeita null / undefined", () => {
    expect(isSellablePrice(null)).toBe(false)
    expect(isSellablePrice(undefined)).toBe(false)
  })
})
