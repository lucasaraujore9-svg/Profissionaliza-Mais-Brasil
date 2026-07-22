import { appUrl, vitrineUrl } from "@/lib/tenant/urls"
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
 *   2. Pagina /pagar da revenda (MP ou Asaas) — checkout transparente: todo
 *      PENDING de uma revenda tem pagina publica reconstruivel a partir do id +
 *      dominio da loja. Cobre venda direta /painel/vendas e carrinho abandonado
 *      da vitrine. A /pagar ramifica pelo `Enrollment.gateway` (Brick do MP vs
 *      formulario Asaas), entao serve aos dois — antes era MP-only e a venda
 *      direta de uma unidade Asaas ficava sem link reenviavel no painel (o
 *      asaasInvoiceUrl so nasce quando o aluno escolhe a forma de pagamento).
 *
 * Retorna null quando nao ha link disponivel (ex.: PMB via MP, sem init_point
 * persistido).
 */
export function buildEnrollmentCheckoutUrl(input: CheckoutLinkInput): string | null {
  if (input.status !== "PENDING") return null

  // Sistema mae (PMB) via Asaas: tela de checkout PROPRIA da marca, no dominio
  // app, que retoma a cobranca pendente — em vez de mandar o aluno para a pagina
  // crua do Asaas (override que vence ate o asaasInvoiceUrl ja persistido).
  // Servida por (main)/pagar/[id] + POST /api/checkout/enrollment/[id].
  if (input.tenantSlug === PMB_TENANT_SLUG && input.gateway === "ASAAS") {
    return `${appUrl()}/pagar/${input.enrollmentId}`
  }

  // Demais casos: a fatura Asaas ja persistida e o link de pagamento (cobre a
  // revenda Asaas — excecao sem tela transparente propria).
  if (input.asaasInvoiceUrl) return input.asaasInvoiceUrl

  // Revenda (checkout transparente): a cobranca pendente sempre tem pagina
  // publica de pagamento, em qualquer um dos dois gateways — a /pagar decide o
  // formulario pelo `Enrollment.gateway`.
  if (
    (input.gateway === "MP" || input.gateway === "ASAAS") &&
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
