import { appUrl, storeBaseUrl } from "@/lib/tenant/urls"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

export interface CheckoutLinkInput {
  /** Status da matricula (so cobrancas PENDING expoem link util). */
  status: string
  /** id da matricula — usado para montar a pagina /pagar. */
  enrollmentId: string
  /** gateway da matricula (MP | ASAAS). */
  gateway: string
  /**
   * Loja dona da matricula. `null` ou o slug placeholder `__pmb__` = vitrine da
   * PMB. O dominio proprio so entra quando verificado (`storeBaseUrl`).
   */
  tenant: {
    slug: string
    customDomain: string | null
    domainVerified: boolean
  } | null
}

/**
 * Link que admin e revenda reenviam ao aluno para pagar uma cobranca PENDENTE.
 *
 * E SEMPRE a pagina de pagamento da propria plataforma (checkout transparente),
 * nunca a pagina do gateway — nem a fatura do Asaas ja emitida, nem o
 * `init_point` do Mercado Pago. Por isso esta funcao nem recebe esses campos:
 * nenhum chamador consegue preferi-los. A pagina retoma a cobranca que ja
 * existe (`processTransparentAsaasPayment` reusa ou substitui a anterior; o MP
 * reusa pela chave de idempotencia), entao reenviar o link nunca deixa duas
 * cobrancas vivas.
 *
 *   - Unidade: `/pagar/<id>` na loja dela (dominio proprio aplicado ou
 *     subdominio). Serve MP e Asaas — a pagina decide pelo `Enrollment.gateway`.
 *   - Vitrine PMB via Asaas: `/pagar/<id>` no dominio da PMB.
 *   - Vitrine PMB via MP: sem pagina de retomada — null.
 */
export function buildEnrollmentCheckoutUrl(input: CheckoutLinkInput): string | null {
  if (input.status !== "PENDING") return null

  const isPmb = !input.tenant || input.tenant.slug === PMB_TENANT_SLUG
  if (isPmb) {
    return input.gateway === "ASAAS" ? `${appUrl()}/pagar/${input.enrollmentId}` : null
  }

  if (input.gateway !== "MP" && input.gateway !== "ASAAS") return null
  if (!input.tenant?.slug) return null
  return `${storeBaseUrl(input.tenant)}/pagar/${input.enrollmentId}`
}
