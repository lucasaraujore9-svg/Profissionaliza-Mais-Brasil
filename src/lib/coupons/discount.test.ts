import { describe, it, expect } from "vitest"
import { applyCouponDiscount } from "./discount"

describe("applyCouponDiscount", () => {
  it("aplica desconto percentual", () => {
    const r = applyCouponDiscount({
      basePrice: 100,
      discountType: "PERCENTAGE",
      discountValue: 50,
    })
    expect(r.discountAmount).toBe(50)
    expect(r.finalAmount).toBe(50)
  })

  it("aplica desconto fixo", () => {
    const r = applyCouponDiscount({
      basePrice: 100,
      discountType: "FIXED",
      discountValue: 30,
    })
    expect(r.discountAmount).toBe(30)
    expect(r.finalAmount).toBe(70)
  })

  it("clampa desconto fixo maior que o preço base (não fica negativo)", () => {
    const r = applyCouponDiscount({
      basePrice: 100,
      discountType: "FIXED",
      discountValue: 200,
    })
    expect(r.discountAmount).toBe(100)
    expect(r.finalAmount).toBe(0)
  })

  it("arredonda ao centavo com half-even (sem erro de float)", () => {
    const r = applyCouponDiscount({
      basePrice: 99.99,
      discountType: "PERCENTAGE",
      discountValue: 33,
    })
    // 99.99 * 33% = 32.9967 -> 33.00 ; final = 66.99
    expect(r.discountAmount).toBe(33)
    expect(r.finalAmount).toBe(66.99)
  })

  it("desconto 100% zera o preço", () => {
    const r = applyCouponDiscount({
      basePrice: 250.5,
      discountType: "PERCENTAGE",
      discountValue: 100,
    })
    expect(r.discountAmount).toBe(250.5)
    expect(r.finalAmount).toBe(0)
  })
})
