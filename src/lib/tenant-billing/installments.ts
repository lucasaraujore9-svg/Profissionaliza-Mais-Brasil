/**
 * Regra PURA do parcelamento no cartao das mensalidades que a unidade paga a
 * PMB. Fonte unica: a pagina de checkout (`/cobranca/[paymentId]`) e a rota que
 * executa a cobranca (`pay-card`) precisam chegar ao MESMO numero — se cada uma
 * derivar o teto por conta propria, a tela oferece 12x e a API recusa em 6x.
 *
 * Sem I/O de proposito (mesmo motivo de `types.ts`): quem lê o banco é o caller.
 *
 * Duas negociacoes diferentes, dois campos:
 *
 *   * 1a mensalidade  → `Tenant.firstPaymentMaxInstallments`. E a ENTRADA,
 *     acertada na venda da revenda. Default 1 (a vista): esticar a entrada é
 *     decisao comercial de quem vendeu, nao um padrao da casa.
 *   * demais          → `Tenant.monthlyMaxInstallments`, com fallback no padrao
 *     global `SystemSettings.tenantMonthlyMaxInstallments`. E alivio de fluxo de
 *     caixa de quem ja e cliente, entao vale para todo mundo sem cadastro.
 *
 * "1a mensalidade" e definido pelo STATUS DA UNIDADE (`PENDING` = nunca ativou),
 * o mesmo predicado que a rota ja usava. Nao por "é a primeira linha de
 * TenantPayment": uma cobranca pode ser removida/recriada no Asaas, e contar
 * linhas faria o teto oscilar.
 */

/** Teto duro: limite do Asaas em POST /installments/. */
export const ASAAS_MAX_INSTALLMENTS = 21

/** O que a decisao precisa saber da unidade. */
export interface InstallmentPolicyInput {
  /** Status atual da unidade. `PENDING` = ainda na 1a mensalidade. */
  tenantStatus: string
  /** Teto da 1a mensalidade (default 1 no schema). */
  firstPaymentMaxInstallments: number
  /** Teto das demais nesta unidade. null = usa o padrao global. */
  monthlyMaxInstallments: number | null
  /** Padrao global (`SystemSettings.tenantMonthlyMaxInstallments`). */
  globalMonthlyMaxInstallments: number
}

/**
 * Unidade que ainda nao ativou — a cobranca em aberto e a mensalidade de
 * entrada. Espelha o predicado que a rota de pagamento ja aplicava.
 */
export function isFirstMonthlyCharge(tenantStatus: string): boolean {
  return tenantStatus === "PENDING"
}

/**
 * Numero maximo de parcelas oferecido para uma cobranca em aberto.
 * Sempre >= 1 (1 = a vista, sem parcelamento) e nunca acima do teto do Asaas —
 * um valor absurdo gravado no banco vira recusa do gateway, nao uma promessa
 * que a tela nao cumpre.
 */
export function maxInstallmentsForCharge(input: InstallmentPolicyInput): number {
  const raw = isFirstMonthlyCharge(input.tenantStatus)
    ? input.firstPaymentMaxInstallments
    : (input.monthlyMaxInstallments ?? input.globalMonthlyMaxInstallments)

  if (!Number.isFinite(raw)) return 1
  return Math.min(ASAAS_MAX_INSTALLMENTS, Math.max(1, Math.trunc(raw)))
}

/**
 * A unidade sai do ar quando a mensalidade vence (`SUSPENDED`) e volta quando
 * paga. Pagar parcelado e pagar: o pos-captura precisa promover a unidade e
 * desbloquear os alunos dela, exatamente como o webhook `PAYMENT_RECEIVED` faz.
 *
 * Decide pelo status de ORIGEM, nao pelo de destino — a mesma licao do gate de
 * cortesia excepcional. Unidade ja `ACTIVE` nao e "reativada": devolver
 * `unblockStudents` ali faria uma escrita inutil na plataforma de aulas a cada
 * mensalidade paga, e mascararia um bloqueio manual legitimo do aluno.
 */
export interface PostCaptureTransition {
  /** Promover a unidade para ACTIVE. */
  activate: boolean
  /** Desbloquear os alunos bloqueados pela suspensao da unidade. */
  unblockStudents: boolean
}

export function postCaptureTransition(tenantStatus: string): PostCaptureTransition {
  if (tenantStatus === "PENDING") return { activate: true, unblockStudents: false }
  if (tenantStatus === "SUSPENDED") return { activate: true, unblockStudents: true }
  return { activate: false, unblockStudents: false }
}
