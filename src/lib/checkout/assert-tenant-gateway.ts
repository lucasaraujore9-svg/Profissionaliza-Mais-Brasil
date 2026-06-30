import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"

/**
 * Invariante de isolamento financeiro multi-tenant.
 *
 * REGRA DE OURO: o gateway E a conta/credencial usados numa venda são função pura
 * do tenant VERIFICADO (host de produção na vitrine, ou `Student.tenantId`
 * autoritativo no fluxo autenticado) — nunca de um cupom, curso, header do cliente
 * ou claim ausente no JWT. A conta-mãe (PMB, `ASAAS_API_KEY` global) só pode cobrar
 * matrícula PMB (`tenantId === null`) cujo aluno pertence ao placeholder `__pmb__`
 * (ou null/legado). Uma venda de revenda que chegue na conta-mãe é VAZAMENTO DE
 * RECEITA (P0) — preferimos LANÇAR e não cobrar a cobrar na conta errada.
 *
 * Contexto: a unidade Polo Betim (e outras) teve vendas roteadas para o Asaas da
 * PMB porque `/api/aluno/comprar` decidia PMB-vs-revenda pelo sinal NEGATIVO
 * `!session.tenantId`. Estes asserts são a defesa em profundidade no "hop do
 * dinheiro": mesmo que o roteamento regrida, a cobrança na conta-mãe falha.
 */
export class TenantGatewayIsolationError extends Error {
  readonly code = "TENANT_GATEWAY_ISOLATION"
  constructor(message: string) {
    super(message)
    this.name = "TenantGatewayIsolationError"
  }
}

/** Um slug de tenant é o placeholder PMB (ou ausência = PMB legado)? */
export function isPmbTenantSlug(slug: string | null | undefined): boolean {
  return slug == null || slug === PMB_TENANT_SLUG
}

/**
 * Garante que esta cobrança pode usar a conta-mãe (PMB). Lança
 * TenantGatewayIsolationError se a matrícula pertence a uma revenda
 * (`enrollmentTenantId !== null`) ou se o aluno pertence a uma revenda real
 * (slug ≠ `__pmb__`). Chamar ANTES de cobrar com a chave Asaas/MP global.
 */
export function assertPmbCharge(input: {
  enrollmentTenantId: string | null
  studentTenantSlug: string | null
  context: string
}): void {
  const { enrollmentTenantId, studentTenantSlug, context } = input
  const enrollmentIsPmb = enrollmentTenantId === null
  const studentIsPmb = isPmbTenantSlug(studentTenantSlug)

  if (!enrollmentIsPmb || !studentIsPmb) {
    contextLogger().error(
      {
        event: "payment.tenant_isolation_violation",
        context,
        enrollmentTenantId,
        studentTenantSlug,
      },
      "BLOQUEADO: cobrança de revenda tentou usar a conta-mãe (PMB)",
    )
    throw new TenantGatewayIsolationError(
      "Cobrança de revenda não pode usar o gateway do sistema mãe",
    )
  }
}

/**
 * Garante que o cupom aplicado pertence ao mesmo tenant da matrícula
 * (cupom de revenda ⇒ matrícula de revenda; cupom PMB `null` ⇒ matrícula `null`).
 * Defesa contra mascaramento por colisão de código entre namespaces.
 */
export function assertCouponMatchesEnrollment(input: {
  couponTenantId: string | null
  enrollmentTenantId: string | null
  context: string
}): void {
  const { couponTenantId, enrollmentTenantId, context } = input
  if (couponTenantId !== enrollmentTenantId) {
    contextLogger().error(
      {
        event: "payment.coupon_tenant_mismatch",
        context,
        couponTenantId,
        enrollmentTenantId,
      },
      "BLOQUEADO: cupom de tenant diferente da matrícula",
    )
    throw new TenantGatewayIsolationError(
      "Cupom não pertence a esta loja",
    )
  }
}
