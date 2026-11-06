/**
 * Regras PURAS da venda direta parcelada com meio escolhido pelo pagador
 * (PIX / boleto / cartão). Sem I/O nem Prisma: roda no client (prévia do
 * formulário) e no server.
 */
import { addMonthsClampedUtc } from "@/lib/dates"
import { appUrl, storeBaseUrl } from "@/lib/tenant/urls"
import {
  INSTALLMENT_REVEAL_WINDOW_DAYS,
  MAX_BOLETO_INSTALLMENTS,
  MIN_INSTALLMENT_AMOUNT,
  isWithinRevealWindow,
} from "./schedule"

export type FlexMethod = "PIX" | "BOLETO" | "CREDIT_CARD"

export interface FlexScheduleInput {
  count: number
  installmentValue: number
  downPayment: number | null
  firstDueDate: Date
  saleDate: Date
}

export interface FlexRowDraft {
  number: number
  amount: number
  dueDate: Date
}

const ALL_METHODS: FlexMethod[] = ["PIX", "BOLETO", "CREDIT_CARD"]

const isCents = (v: number) =>
  Number.isFinite(v) && Math.abs(Math.round(v * 100) - v * 100) < 1e-6

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ")

/** Mensagem de erro (para o formulário) ou null se o plano é válido. */
export function flexScheduleError(i: FlexScheduleInput): string | null {
  if (!Number.isInteger(i.count) || i.count < 1) return "Informe a quantidade de parcelas."
  if (i.count > MAX_BOLETO_INSTALLMENTS) {
    return `O máximo é de ${MAX_BOLETO_INSTALLMENTS} parcelas.`
  }
  if (!isCents(i.installmentValue) || i.installmentValue < MIN_INSTALLMENT_AMOUNT) {
    return `A parcela não pode ser menor que R$ ${MIN_INSTALLMENT_AMOUNT},00.`
  }
  if (i.downPayment !== null) {
    if (!isCents(i.downPayment) || i.downPayment < MIN_INSTALLMENT_AMOUNT) {
      return `A entrada não pode ser menor que R$ ${MIN_INSTALLMENT_AMOUNT},00.`
    }
  } else if (i.count < 2) {
    return "Sem entrada, informe pelo menos 2 parcelas."
  }
  return null
}

/** Entrada (se houver) na data da venda; depois as parcelas, mensais a partir de firstDueDate. */
export function buildFlexSchedule(i: FlexScheduleInput): FlexRowDraft[] {
  const rows: FlexRowDraft[] = []
  if (i.downPayment !== null) {
    rows.push({ number: 1, amount: i.downPayment, dueDate: i.saleDate })
  }
  for (let k = 0; k < i.count; k++) {
    rows.push({
      number: rows.length + 1,
      amount: i.installmentValue,
      dueDate: k === 0 ? i.firstDueDate : addMonthsClampedUtc(i.firstDueDate, k),
    })
  }
  return rows
}

export function flexTotal(
  i: Pick<FlexScheduleInput, "count" | "installmentValue" | "downPayment">,
): number {
  const cents = Math.round(i.installmentValue * 100) * i.count + Math.round((i.downPayment ?? 0) * 100)
  return cents / 100
}

export function flexRowLabel(
  row: { number: number },
  hasDownPayment: boolean,
  rowsTotal: number,
): string {
  if (hasDownPayment) {
    return row.number === 1 ? "Entrada" : `Parcela ${row.number - 1} de ${rowsTotal - 1}`
  }
  return `Parcela ${row.number} de ${rowsTotal}`
}

export function flexPlanSummary(i: {
  hasDownPayment: boolean
  downPayment: number | null
  count: number
  installmentValue: number
}): string {
  const parcelas = `${i.count}x ${brl(i.installmentValue)}`
  const total = `total ${brl(flexTotal({ ...i, downPayment: i.hasDownPayment ? i.downPayment : null }))}`
  return i.hasDownPayment
    ? `Entrada ${brl(i.downPayment ?? 0)} + ${parcelas} · ${total}`
    : `${parcelas} · ${total}`
}

/**
 * Resumo do plano a partir das LINHAS gravadas (`amount` em reais). Depois de
 * uma renegociação (edit.ts) as parcelas podem ter valores diferentes: aí não
 * cabe "Nx R$ V" e o resumo mostra só a quantidade e o total somado.
 */
export function flexRowsSummary(rows: { amount: number }[], hasDownPayment: boolean): string {
  const cents = rows.map((r) => Math.round(r.amount * 100))
  const parcelas = hasDownPayment ? cents.slice(1) : cents
  if (parcelas.length > 0 && parcelas.every((c) => c === parcelas[0])) {
    return flexPlanSummary({
      hasDownPayment,
      downPayment: hasDownPayment ? (cents[0] ?? 0) / 100 : null,
      count: parcelas.length,
      installmentValue: parcelas[0] / 100,
    })
  }
  const body = `${parcelas.length} parcelas · total ${brl(cents.reduce((a, c) => a + c, 0) / 100)}`
  return hasDownPayment ? `Entrada ${brl((cents[0] ?? 0) / 100)} + ${body}` : body
}

export interface FlexRowState {
  number: number
  status: "SCHEDULED" | "GENERATED" | "PAID" | "OVERDUE" | "CANCELLED"
  dueDate: Date
  cardDeclinedAt: Date | null
  /** Em reais. */
  amount: number
}

/** A assinatura do cartão cobra um valor fixo: só cabe com as linhas abertas iguais. */
export function openRowsEqual(rows: { amount: number }[]): boolean {
  const cents = rows.map((r) => Math.round(r.amount * 100))
  return cents.every((c) => c === cents[0])
}

export interface FlexPlanState {
  hasDownPayment: boolean
  method: FlexMethod | null
  subscriptionActive: boolean
  rows: FlexRowState[]
}

export type FlexOffer =
  | { kind: "pay"; rowNumber: number; methods: FlexMethod[]; card: "single" | "subscription" | null }
  | { kind: "auto"; nextDueDate: Date } // cartão em dia
  | { kind: "waiting"; availableFrom: Date } // próxima linha fora da janela
  | { kind: "done" }

/** O que o aluno pode fazer agora: pagar a linha da vez, esperar, ou nada. */
export function flexOffer(plan: FlexPlanState, now: Date): FlexOffer {
  const open = plan.rows
    .filter((r) => r.status !== "PAID" && r.status !== "CANCELLED")
    .sort((a, b) => a.number - b.number)
  const row = open[0]
  if (!row) return { kind: "done" }

  if (plan.hasDownPayment && row.number === 1) {
    return { kind: "pay", rowNumber: 1, methods: ALL_METHODS, card: "single" }
  }
  if (plan.method === "CREDIT_CARD" && !row.cardDeclinedAt && plan.subscriptionActive) {
    return { kind: "auto", nextDueDate: row.dueDate }
  }
  if (!isWithinRevealWindow(row, now)) {
    const availableFrom = new Date(row.dueDate)
    availableFrom.setUTCDate(availableFrom.getUTCDate() - INSTALLMENT_REVEAL_WINDOW_DAYS)
    return { kind: "waiting", availableFrom }
  }
  if (plan.method === "PIX" || plan.method === "BOLETO") {
    return { kind: "pay", rowNumber: row.number, methods: [plan.method], card: null }
  }
  // Renegociadas com valores diferentes: a assinatura cobraria um valor que o
  // aluno não viu. Sobra PIX/boleto linha a linha.
  if (!openRowsEqual(open)) {
    return { kind: "pay", rowNumber: row.number, methods: ["PIX", "BOLETO"], card: null }
  }
  return { kind: "pay", rowNumber: row.number, methods: ALL_METHODS, card: "subscription" }
}

/** Página de pagamento do plano: a loja da unidade, ou a PMB quando a venda é dela. */
export function flexPaymentUrl(
  enrollmentId: string,
  tenant: { slug: string; customDomain?: string | null; domainVerified?: boolean | null } | null,
): string {
  return `${tenant ? storeBaseUrl(tenant) : appUrl()}/pagar/${enrollmentId}`
}
