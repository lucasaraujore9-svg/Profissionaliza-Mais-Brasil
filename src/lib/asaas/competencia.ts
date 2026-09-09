/**
 * COMPETENCIA de uma mensalidade: a que mes ela pertence.
 *
 *     competencia = max(vencimento, data em que o cliente pagou)
 *
 * Le-se: a mensalidade pertence ao mes da FATURA; se o pagamento atrasar, ela
 * anda para o mes em que o dinheiro foi pago. Antecipar nao move nada — quem
 * paga a fatura de agosto no dia 30/07 pagou agosto.
 *
 * As duas metades vieram de casos reais (decisao do dono, 09/09/2026):
 *
 *   ANTECIPADO  `Lira's` venceu 02/08 e pagou 30/07. Pela data do pagamento a
 *               mensalidade cairia em julho e o mes de agosto ficaria sem ela.
 *   ATRASADO    `otymus` venceu 31/08 e pagou 05/09. Pelo vencimento ela cairia
 *               em agosto — um mes que ja teria sido fechado e pago sem esse
 *               dinheiro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUAL "DATA DE PAGAMENTO"  ← nao troque por `paymentDate` sozinho
 *
 * O Asaas manda duas: `clientPaymentDate` (quando o cliente pagou) e
 * `paymentDate` (quando o Asaas liquidou/creditou). No PIX e no boleto elas
 * coincidem; **no CARTAO o credito sai em D+32**. Medido em producao: 43
 * cobrancas com as duas datas em MESES diferentes, todas cartao. Usar so o
 * credito atrasava a competencia em um mes inteiro para quem paga no cartao.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `paidAt` NAO MUDA. Sao perguntas diferentes e as duas sao necessarias:
 *
 *   TenantPayment.paidAt        CAIXA — quando o dinheiro entrou. Churn,
 *                               blacklist, financeiro, inadimplencia.
 *   TenantPayment.clientPaidAt  FATO — quando o cliente pagou (auditoria e a
 *                               explicacao que aparece no relatorio).
 *   TenantPayment.competenceAt  REGRA — a que mes a mensalidade pertence.
 *                               So o motor de comissao consome.
 *
 * A competencia e coluna PERSISTIDA, e nao um `max()` calculado na consulta,
 * porque o motor varre a competencia por range de data: sem coluna, cada
 * varredura viraria uma leitura completa do ledger com filtro em memoria.
 */

export interface AsaasPaymentDates {
  dueDate: string
  paymentDate: string | null
  clientPaymentDate: string | null
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Quando o CLIENTE pagou — `clientPaymentDate`, com o credito como fallback. */
export function dataPagamentoCliente(payment: AsaasPaymentDates): Date | null {
  return parseDate(payment.clientPaymentDate) ?? parseDate(payment.paymentDate)
}

/**
 * A que mes a mensalidade pertence. `null` enquanto ela nao foi paga — sem
 * pagamento nao ha competencia, e gravar o vencimento sozinho faria uma fatura
 * em aberto contar como receita do mes.
 */
export function competenciaPagamento(payment: AsaasPaymentDates): Date | null {
  const pago = dataPagamentoCliente(payment)
  if (!pago) return null
  const venc = parseDate(payment.dueDate)
  if (!venc) return pago
  return resolverCompetencia(venc, pago)
}

/**
 * O `max` propriamente dito, separado para ser reusado pelo backfill e testado
 * sem depender do formato do Asaas.
 */
export function resolverCompetencia(dueDate: Date, pagoEm: Date): Date {
  return pagoEm.getTime() > dueDate.getTime() ? pagoEm : dueDate
}
