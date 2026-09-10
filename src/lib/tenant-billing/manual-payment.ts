/**
 * BAIXA FINANCEIRA MANUAL — mensalidade recebida FORA da plataforma.
 *
 * A unidade paga por PIX direto, transferencia ou dinheiro; a cobranca do Asaas
 * e cancelada (vira `DELETED`) e nao sobra linha nenhuma para dar baixa. O
 * resultado, ate 09/09/2026: o dinheiro entrou, mas para o sistema a unidade
 * "nunca pagou" — sumia da comissao de indicacao, entrava na base de churn como
 * quem nunca ativou e podia cair na trava de cortesia excepcional.
 *
 * O caso real: `desenvolve tamarana` pagou TRES meses adiantados por fora, teve
 * a cobranca excluida, e por isso ficou fora da apuracao de agosto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UM LANCAMENTO POR MES PAGO, nunca um lancamento somado (decisao do dono)
 *
 * Tres mensalidades adiantadas viram TRES linhas, com os vencimentos que elas
 * teriam. Duas razoes:
 *
 *   1. COMISSAO. A competencia e `max(vencimento, pagamento)`, entao cada linha
 *      cai no seu mes e a comissao do indicador sai mes a mes. Num lancamento
 *      unico de R$ 717 o teto por fatura (ver referrals/plano-base.ts) limitaria
 *      a proporcao a 1 e ele receberia por UM mes.
 *   2. INADIMPLENCIA. A varredura pergunta "existe cobranca paga deste ciclo?".
 *      Com um lancamento so, os meses seguintes ficariam descobertos e a unidade
 *      seria suspensa por uma mensalidade que ela ja tinha pago.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O ID E SINTETICO E NAO NULO
 *
 * `TenantPayment.asaasPaymentId` e `@unique` e NAO nulo, e ha muito codigo que
 * o assume presente. A linha manual recebe `manual_<uuid>` — mesmo padrao do
 * `ins_...` que a coluna ja guarda num parcelamento de cartao, que tambem nao
 * resolve em `GET /payments/{id}`. `isManualPayment` e o que permite a quem fala
 * com o Asaas pular essas linhas em vez de tomar 404.
 */
import { addMonthsClampedUtc } from "@/lib/dates"
import { resolverCompetencia } from "@/lib/asaas/competencia"

/** Prefixo do id sintetico. Nao mude: ha dados em producao com ele. */
export const MANUAL_PAYMENT_PREFIX = "manual_"

/** Teto de mensalidades por lancamento — um ano. Erro de digitacao ("36") nao vira 36 linhas. */
export const MAX_MANUAL_MONTHS = 12

export function isManualPayment(asaasPaymentId: string | null | undefined): boolean {
  return typeof asaasPaymentId === "string" && asaasPaymentId.startsWith(MANUAL_PAYMENT_PREFIX)
}

export function newManualPaymentId(): string {
  return `${MANUAL_PAYMENT_PREFIX}${crypto.randomUUID()}`
}

export interface ManualPaymentInput {
  /** Valor de UMA mensalidade, nao o total pago. */
  amount: number
  /** Quantas mensalidades o pagamento cobre (1 = so a do mes). */
  months: number
  /** Vencimento da PRIMEIRA mensalidade coberta. */
  firstDueDate: Date
  /** Quando a unidade efetivamente pagou. */
  paidAt: Date
}

export interface ManualPaymentLine {
  /** Vencimento que esta mensalidade teria. */
  dueDate: Date
  /** A que mes ela pertence — `max(vencimento, pagamento)`. */
  competenceAt: Date
  amount: number
}

export class ManualPaymentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_AMOUNT"
      | "INVALID_MONTHS"
      | "INVALID_DATE",
  ) {
    super(message)
    this.name = "ManualPaymentError"
  }
}

/**
 * As linhas a criar, uma por mensalidade coberta. PURO: nao gera id nem toca o
 * banco, entao a regra de meses/competencia e testavel sozinha.
 *
 * `addMonthsClampedUtc` e nao `setMonth` cru: mensalidade que vence dia 31 nao
 * pode pular para o dia 3 do mes seguinte ao atravessar fevereiro. E a variante
 * UTC porque `dueDate` e meia-noite UTC — a versao em horario local erra o dia
 * em servidor de fuso negativo.
 */
export function buildManualPaymentLines(
  input: ManualPaymentInput,
): ManualPaymentLine[] {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ManualPaymentError(
      "O valor da mensalidade tem de ser maior que zero.",
      "INVALID_AMOUNT",
    )
  }
  if (
    !Number.isInteger(input.months) ||
    input.months < 1 ||
    input.months > MAX_MANUAL_MONTHS
  ) {
    throw new ManualPaymentError(
      `Informe de 1 a ${MAX_MANUAL_MONTHS} mensalidades.`,
      "INVALID_MONTHS",
    )
  }
  if (
    Number.isNaN(input.firstDueDate.getTime()) ||
    Number.isNaN(input.paidAt.getTime())
  ) {
    throw new ManualPaymentError("Data invalida.", "INVALID_DATE")
  }

  const lines: ManualPaymentLine[] = []
  for (let i = 0; i < input.months; i++) {
    const dueDate = addMonthsClampedUtc(input.firstDueDate, i)
    lines.push({
      dueDate,
      competenceAt: resolverCompetencia(dueDate, input.paidAt),
      amount: input.amount,
    })
  }
  return lines
}

/** Competencia no formato "AAAA-MM" — a chave por onde se detecta mes repetido. */
export function competenceKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}
