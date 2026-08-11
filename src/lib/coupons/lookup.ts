import { prisma } from "@/lib/prisma"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import type { CouponPreviewResult } from "@/lib/coupons/types"

/**
 * Núcleo compartilhado da PRÉVIA de cupom: dado um escopo já resolvido no
 * servidor (`tenantId` null = PMB, string = unidade), busca o cupom, aplica as
 * regras de estado (ativo/vigência/estoque) e calcula o desconto.
 *
 * NÃO consome uso do cupom — a reserva (`tryConsumeCoupon`) continua sendo
 * exclusiva das rotas que criam a cobrança. Prévia é leitura.
 *
 * `tenantId` é o único parâmetro que decide QUAIS cupons existem para quem
 * pergunta; por isso ele NUNCA pode vir do client. Cada chamador o resolve da
 * sua própria fonte autoritativa (header do proxy na vitrine, `Student.tenantId`
 * na área do aluno) antes de chamar aqui.
 *
 * A busca não filtra `isActive`/vigência no `where` de propósito: só assim dá
 * para diferenciar "não existe" de "desativado"/"expirado"/"esgotado" na
 * mensagem — a UX que a vitrine já tinha e que a área do aluno herda.
 */
export async function lookupCouponForScope(input: {
  tenantId: string | null
  code: string
  basePrice: number
}): Promise<CouponPreviewResult> {
  const code = input.code.trim().toUpperCase()
  if (!code) return { ok: false, error: "Informe o cupom." }

  const basePrice = Math.max(0, Number(input.basePrice) || 0)
  if (basePrice <= 0) return { ok: false, error: "Este pedido não aceita cupom." }

  const coupon = await prisma.coupon.findFirst({
    where: { tenantId: input.tenantId, code },
    select: {
      code: true,
      discountType: true,
      discountValue: true,
      maxUses: true,
      usedCount: true,
      isActive: true,
      validFrom: true,
      validUntil: true,
    },
  })

  if (!coupon) {
    return { ok: false, error: "Cupom não encontrado. Confira a digitação." }
  }
  if (!coupon.isActive) {
    return { ok: false, error: "Este cupom foi desativado." }
  }
  const now = new Date()
  if (coupon.validFrom > now) {
    return {
      ok: false,
      error: `Cupom ainda não está válido (começa em ${coupon.validFrom.toLocaleDateString("pt-BR")}).`,
    }
  }
  if (coupon.validUntil < now) {
    return {
      ok: false,
      error: `Este cupom expirou em ${coupon.validUntil.toLocaleDateString("pt-BR")}.`,
    }
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "Cupom esgotado — todas as utilizações já foram usadas." }
  }

  // `applyCouponDiscount` (Prisma.Decimal + half-even) é o MESMO cálculo das
  // rotas de cobrança — a prévia bate centavo a centavo com o valor cobrado.
  const { discountAmount, finalAmount } = applyCouponDiscount({
    basePrice,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
  })

  return {
    ok: true,
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      discountAmount,
      finalPrice: finalAmount,
    },
  }
}
