"use server"

import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { rateLimitByKey, RATE_LIMITS } from "@/lib/ratelimit"
import type {
  CouponPreviewInput,
  CouponPreviewResult,
} from "@/lib/coupons/types"

/**
 * Server Action de PREVIEW de cupom usada pelo wrapper de checkout
 * (CheckoutPanel). Diferente de `/api/loja/cupom/validar` (que só cobre
 * vitrine + curso e resolve o tenant pelo host), aqui o ESCOPO é passado
 * explicitamente pelo server component da página — então funciona igual para:
 *   - vitrine de revenda (scope.tenantId) e PMB (scope.pmb → tenantId null);
 *   - compra de curso e de pacote (o basePrice já vem resolvido da página).
 *
 * `basePrice` é apenas para o PREVIEW (o valor exibido). A COBRANÇA real é
 * sempre revalidada e recalculada no servidor em /api/loja/checkout (e afins)
 * no momento de criar a matrícula — então um basePrice adulterado no client só
 * engana o próprio comprador no resumo, nunca o valor cobrado.
 *
 * Reusa `applyCouponDiscount` (Prisma.Decimal + half-even) para que o preview
 * bata exatamente com o que será cobrado.
 */

export async function previewCheckoutCoupon(
  input: CouponPreviewInput,
): Promise<CouponPreviewResult> {
  const code = input.code.trim().toUpperCase()
  if (!code) return { ok: false, error: "Informe o cupom." }

  const basePrice = Math.max(0, Number(input.basePrice) || 0)
  if (basePrice <= 0) return { ok: false, error: "Este pedido não aceita cupom." }

  const h = await headers()

  // Tenant AUTORITATIVO: resolvido dos headers que o proxy injeta (x-tenant-id /
  // x-tenant-slug — não spoofáveis: o proxy remove qualquer x-tenant-* do
  // cliente antes de reclassificar o host). NÃO confiamos no `input.scope.tenantId`
  // vindo do client: como esta é uma Server Action pública, um scope adulterado
  // permitiria enumerar os cupons de OUTRA unidade. Sem header de tenant ⇒
  // contexto PMB (tenantId null). Espelha `resolveTenantFromRequest`.
  const headerTenantId = h.get("x-tenant-id")?.trim() || null
  const headerTenantSlug = h.get("x-tenant-slug")?.trim() || null
  let tenantId: string | null = null
  if (headerTenantId || headerTenantSlug) {
    const resolved = await prisma.tenant.findFirst({
      where: headerTenantId
        ? { id: headerTenantId }
        : { slug: headerTenantSlug as string },
      select: { id: true },
    })
    tenantId = resolved?.id ?? null
  }

  // Rate limit (mesma política da rota /api/loja/cupom/validar) — evita
  // enumeração de cupons via Server Action. Sem Request aqui; chaveia por IP
  // extraído dos headers.
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  const rl = await rateLimitByKey(ip, RATE_LIMITS.publicCupom)
  if (!rl.ok) {
    return { ok: false, error: "Muitas tentativas. Aguarde um instante e tente novamente." }
  }

  // Não filtra isActive/validade no findFirst para diferenciar as mensagens
  // (mesma UX da rota /api/loja/cupom/validar).
  const coupon = await prisma.coupon.findFirst({
    where: { tenantId, code },
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
