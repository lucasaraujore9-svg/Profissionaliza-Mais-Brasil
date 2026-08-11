"use server"

import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { lookupCouponForScope } from "@/lib/coupons/lookup"
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

  // Busca + regras de estado + cálculo do desconto vivem em
  // `lookupCouponForScope`, compartilhado com a prévia da área do aluno
  // (/api/aluno/cupom/validar) — mesma mensagem de erro e mesma aritmética.
  return lookupCouponForScope({ tenantId, code, basePrice })
}
