import { prisma } from "@/lib/prisma"

/**
 * Incrementa atomicamente `used_count` do cupom respeitando `max_uses`.
 *
 * Retorna `true` se conseguiu reservar mais um uso, `false` se o cupom
 * já estava esgotado. A operação é uma única instrução SQL — sem race
 * entre check (`used_count < max_uses`) e increment.
 *
 * Use APÓS validar o cupom e ANTES de finalizar o fluxo de checkout.
 * Em fluxos onde o pagamento pode falhar depois, considere chamar
 * `releaseCoupon` em caso de erro (best-effort — leve overcount é aceitável
 * se o pagamento expirar sem usar o cupom).
 */
export async function tryConsumeCoupon(couponId: string): Promise<boolean> {
  const affected = await prisma.$executeRaw`
    UPDATE coupons
    SET used_count = used_count + 1, updated_at = NOW()
    WHERE id = ${couponId}
      AND (max_uses IS NULL OR used_count < max_uses)
  `
  return affected > 0
}

/**
 * Decrementa `used_count` (best-effort). Use quando o fluxo de checkout
 * falhou após `tryConsumeCoupon` — ex: erro ao criar a preferência no MP.
 * Nunca leva o contador abaixo de 0.
 */
export async function releaseCoupon(couponId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE coupons
    SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
    WHERE id = ${couponId}
  `
}
