import { Prisma } from "@prisma/client"

/**
 * Calcula o desconto e o valor final aplicando o cupom com aritmética
 * `Prisma.Decimal` em vez de float JS. Antes as três rotas de checkout
 * usavam `(basePrice * Number(discountValue)) / 100` em ponto flutuante,
 * o que acumula erro em valores BR (R$ 99,99 * 33% gera 32,9967 mas
 * `toFixed(2)` arredonda diferente de `Decimal.toDecimalPlaces`).
 *
 * Helper único garante consistência entre /api/loja/checkout,
 * /api/painel/vendas e /api/aluno/comprar.
 */
type DecimalLike = number | string | Prisma.Decimal

export function applyCouponDiscount(input: {
  basePrice: DecimalLike
  discountType: "PERCENTAGE" | "FIXED"
  discountValue: DecimalLike
}): {
  discountAmount: number
  finalAmount: number
} {
  const base = new Prisma.Decimal(input.basePrice)
  const value = new Prisma.Decimal(input.discountValue)

  let raw: Prisma.Decimal
  if (input.discountType === "PERCENTAGE") {
    raw = base.mul(value).div(100)
  } else {
    raw = value
  }

  // Desconto nunca pode ser maior que o preço base (cupom FIXED de R$ 200
  // em curso de R$ 100 vira "grátis", não negativo).
  const clamped = raw.gt(base) ? base : raw

  // Arredondamento bancário (half-even) ao centavo — alinha com o display
  // financeiro do painel admin e com Asaas/MP que aceitam apenas .XX.
  const discountAmount = clamped.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN)
  const finalAmount = base.sub(discountAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN)

  return {
    discountAmount: Number(discountAmount),
    finalAmount: Number(finalAmount),
  }
}
