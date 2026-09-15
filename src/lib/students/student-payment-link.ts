/**
 * Resolve para ONDE o proprio aluno logado paga uma cobranca PENDENTE, a partir
 * da area do aluno (`/aluno`). Diferente de `buildEnrollmentCheckoutUrl` (link
 * ABSOLUTO que admin/revenda reenviam), aqui o destino e sempre um caminho
 * RELATIVO in-app: navegacao na mesma aba preserva a sessao do aluno e o mantem
 * dentro da marca.
 *
 * NUNCA a pagina do gateway. A fatura hospedada do Asaas tinha prioridade
 * porque o checkout in-app criava uma cobranca NOVA a cada volta; hoje ele
 * retoma a anterior (`processTransparentAsaasPayment`), entao a unica porta de
 * pagamento e a da plataforma. Por isso esta funcao nem recebe `asaasInvoiceUrl`.
 *
 * Ordem de resolucao:
 *   1. Carne (BOLETO_INSTALLMENT) → `/aluno/pagamentos`, onde ficam as parcelas.
 *      A tela de checkout in-app cobraria o valor TOTAL da compra.
 *   2. Revenda → `/aluno/comprar/pagar/[id]` (cartao/PIX/boleto na conta da
 *      unidade), so quando a loja PODE receber: `ACTIVE` e, no MP, com
 *      `mpPublicKey`. Senao a pagina cai em "Loja indisponivel" — um botao que
 *      promete e nao cobra e pior que nenhum.
 *   3. Venda direta PMB via Asaas → `/pagar/[id]`, a tela de retomada da marca.
 *   4. Venda direta PMB via MP: sem checkout reabrivel — null.
 */
export interface PayableEnrollment {
  /** Status da matricula — so PENDING expoe checkout util. */
  status: string
  /** id da matricula. */
  id: string
  /** gateway da matricula (MP | ASAAS). */
  gateway: string
  /** Carne paga por parcela, nunca pelo checkout da compra inteira. */
  paymentType: string
  /** tenant dono da matricula; null = venda direta do sistema-mae (PMB). */
  tenantId: string | null
  /**
   * Loja dona da matricula (`null` em venda direta PMB ou quando nao carregada).
   * Define se a revenda pode receber pelo checkout in-app.
   */
  tenant: { status: string; mpPublicKey: string | null } | null
}

export interface StudentPaymentTarget {
  href: string
  /** Sempre false: todo destino e uma pagina da propria plataforma. */
  external: false
}

export function studentPaymentTarget(
  e: PayableEnrollment,
): StudentPaymentTarget | null {
  if (e.status !== "PENDING") return null

  if (e.paymentType === "BOLETO_INSTALLMENT") {
    return { href: "/aluno/pagamentos", external: false }
  }

  if (e.tenantId) {
    const t = e.tenant
    if (!t || t.status !== "ACTIVE") return null
    if (e.gateway !== "ASAAS" && !t.mpPublicKey) return null
    return { href: `/aluno/comprar/pagar/${e.id}`, external: false }
  }

  if (e.gateway === "ASAAS") return { href: `/pagar/${e.id}`, external: false }

  return null
}
