import { vitrineUrl } from "@/lib/tenant/urls"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

export interface CheckoutLinkInput {
  /** Status da matricula (so cobrancas PENDING expoem link util). */
  status: string
  /** id da matricula — usado para montar a pagina /pagar das revendas. */
  enrollmentId: string
  /** gateway da matricula (MP | ASAAS). */
  gateway: string
  /** invoiceUrl do Asaas persistido, se houver. */
  asaasInvoiceUrl: string | null
  /** slug do tenant dono da matricula (PMB usa o slug placeholder). */
  tenantSlug: string
  /** dominio proprio do tenant, se configurado. */
  tenantCustomDomain: string | null
}

/**
 * Monta o link de checkout/recuperacao de uma matricula para que admin (sistema
 * mae) ou revenda possam reenviar ao aluno. So retorna link para cobrancas
 * PENDING (venda direta aguardando pagamento ou carrinho abandonado). Matriculas
 * ja pagas/canceladas nao tem checkout valido para reabrir.
 *
 * Ordem de resolucao (a 1a que existir vence):
 *   1. asaasInvoiceUrl — fatura Asaas persistida. Cobre o sistema mae (PMB usa
 *      Asaas para tudo) e as revendas Asaas (excecao) com fatura ja criada.
 *   2. Pagina /pagar da revenda (SO gateway MP) — checkout transparente: todo
 *      PENDING de uma revenda MP tem pagina publica reconstruivel a partir do id
 *      + dominio da loja. Cobre venda direta /painel/vendas e carrinho abandonado
 *      da vitrine. A /pagar so renderiza o Brick do MP (exige mpPublicKey), entao
 *      NAO serve para revenda Asaas: nesse caso o link util e o asaasInvoiceUrl
 *      (passo 1); abandonado sem fatura ainda fica sem link (melhor que link MP
 *      quebrado).
 *
 * Retorna null quando nao ha link disponivel (ex.: revenda Asaas abandonada sem
 * fatura).
 */
export function buildEnrollmentCheckoutUrl(input: CheckoutLinkInput): string | null {
  if (input.status !== "PENDING") return null

  if (input.asaasInvoiceUrl) return input.asaasInvoiceUrl

  // Revenda via MP (gateway transparente): a cobranca pendente sempre tem pagina
  // publica de pagamento. Restrito a MP porque /pagar so monta o Brick do MP.
  if (
    input.gateway === "MP" &&
    input.tenantSlug &&
    input.tenantSlug !== PMB_TENANT_SLUG
  ) {
    const base = input.tenantCustomDomain
      ? `https://${input.tenantCustomDomain}`
      : vitrineUrl(input.tenantSlug)
    return `${base}/pagar/${input.enrollmentId}`
  }

  return null
}
