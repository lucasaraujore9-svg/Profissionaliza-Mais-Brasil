/**
 * Resolve para ONDE o proprio aluno logado paga uma cobranca PENDENTE, a partir
 * da area do aluno (`/aluno`). Diferente de `buildEnrollmentCheckoutUrl` (que
 * monta links ABSOLUTOS para o admin/revenda reenviarem ao aluno, cruzando
 * dominio), aqui devolvemos, sempre que possivel, um caminho RELATIVO in-app:
 * navegacao na mesma aba preserva a sessao do aluno e o mantem dentro da marca.
 *
 * Bug que isto corrige: a lista de cobrancas em aberto so mostrava "Pagar agora"
 * quando havia `asaasInvoiceUrl`. Matriculas de revenda via Mercado Pago (o
 * gateway @default) nunca tem esse campo — e o init_point do MP nao e persistido
 * — entao ficavam SEM nenhum botao de pagamento. A revenda ja tem, porem, uma
 * pagina de checkout transparente reaproveitavel (`/aluno/comprar/pagar/[id]`,
 * autorizada por sessao) que cobra na conta da propria unidade.
 *
 * Ordem de resolucao (a 1a que existir vence):
 *   1. `asaasInvoiceUrl` — fatura Asaas ja emitida (PMB e revenda Asaas). Link
 *      direto e garantido; abre em nova aba. Mantem o comportamento que ja
 *      funcionava hoje, sem regressao.
 *   2. Revenda (tem `tenantId`) sem fatura Asaas ⇒ tipicamente MP: pagina
 *      transparente in-app `/aluno/comprar/pagar/[id]` (cartao/PIX/boleto na
 *      conta MP/Asaas da unidade). **Este e o caso que estava sem botao.**
 *      So oferecemos quando a loja PODE receber: `tenant.status === "ACTIVE"` e,
 *      no caso MP, com `mpPublicKey` configurada. Senao a pagina de checkout
 *      cai em "Loja indisponivel" — um botao "Pagar agora" que promete e nao
 *      cobra e pior que nenhum botao (o aluno segue com "Ja fiz o pagamento").
 *   3. Venda direta PMB (`tenantId === null`) via Asaas sem fatura persistida:
 *      tela de retomada da marca `/pagar/[id]` (emite a cobranca no Asaas da PMB).
 *   4. Venda direta PMB via MP sem link persistido: nao ha checkout reabrivel —
 *      retorna null (fluxo raro; o aluno segue com "Ja fiz o pagamento").
 */
export interface PayableEnrollment {
  /** Status da matricula — so PENDING expoe checkout util. */
  status: string
  /** id da matricula. */
  id: string
  /** gateway da matricula (MP | ASAAS). */
  gateway: string
  /** tenant dono da matricula; null = venda direta do sistema-mae (PMB). */
  tenantId: string | null
  /** invoiceUrl do Asaas persistido, se houver. */
  asaasInvoiceUrl: string | null
  /**
   * Loja dona da matricula (`null` em venda direta PMB ou quando nao carregada).
   * Define se a revenda pode receber pelo checkout in-app: exigimos `ACTIVE` e,
   * no MP, `mpPublicKey`. Ver caso 2 abaixo.
   */
  tenant: { status: string; mpPublicKey: string | null } | null
}

export interface StudentPaymentTarget {
  href: string
  /**
   * true  → link externo (fatura Asaas): abre em nova aba.
   * false → caminho in-app: navegacao na mesma aba, sessao preservada.
   */
  external: boolean
}

export function studentPaymentTarget(
  e: PayableEnrollment,
): StudentPaymentTarget | null {
  if (e.status !== "PENDING") return null

  // 1. Fatura Asaas ja emitida (PMB ou revenda Asaas): link direto e garantido.
  if (e.asaasInvoiceUrl) return { href: e.asaasInvoiceUrl, external: true }

  // 2. Revenda sem fatura Asaas (tipicamente MP): checkout transparente in-app
  //    na conta da unidade — autorizado pela sessao do aluno. So oferecemos se a
  //    loja pode receber: ACTIVE e, no MP, com mpPublicKey (o Asaas nao precisa).
  //    Caso contrario a tela `/aluno/comprar/pagar/[id]` mostra "Loja
  //    indisponivel"; entao nao renderizamos o botao (retorna null).
  if (e.tenantId) {
    const t = e.tenant
    if (!t || t.status !== "ACTIVE") return null
    if (e.gateway !== "ASAAS" && !t.mpPublicKey) return null
    return { href: `/aluno/comprar/pagar/${e.id}`, external: false }
  }

  // 3. Venda direta PMB via Asaas sem fatura persistida: tela de retomada da marca.
  if (e.gateway === "ASAAS") return { href: `/pagar/${e.id}`, external: false }

  // 4. Venda direta PMB via MP sem link persistido: sem checkout reabrivel.
  return null
}
