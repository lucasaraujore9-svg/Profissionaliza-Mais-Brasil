/**
 * Núcleo PURO do carnê (venda parcelada no boleto). Sem I/O — só a matemática da
 * agenda de parcelas e as regras de visibilidade/janela. Testável isoladamente.
 */
import { addMonthsClamped } from "@/lib/dates"

/** Dias antes do vencimento em que o boleto da parcela fica disponível ao aluno. */
export const INSTALLMENT_REVEAL_WINDOW_DAYS = 7

/** payment_method_id de boleto default no Mercado Pago (payment_type_id `ticket`). */
export const MP_BOLETO_METHOD_ID = "bolbradesco"

/** Teto absoluto de parcelas (o cap por unidade — boletoInstallmentMaxCount — é ≤ este). */
export const MAX_BOLETO_INSTALLMENTS = 24

/** Mínimo de parcelas para caracterizar um parcelamento. */
export const MIN_BOLETO_INSTALLMENTS = 2

export interface ScheduledInstallment {
  /** 1..N — ordem da parcela. */
  number: number
  /** Valor da parcela. */
  amount: number
  /** Vencimento. */
  dueDate: Date
}

/**
 * Monta a agenda: N parcelas de `installmentValue`, a 1ª vencendo em
 * `firstDueDate` e as demais mensais (dia preservado, com clamp de fim de mês).
 */
export function buildInstallmentSchedule(params: {
  count: number
  installmentValue: number
  firstDueDate: Date
}): ScheduledInstallment[] {
  const { count, installmentValue, firstDueDate } = params
  const rows: ScheduledInstallment[] = []
  for (let i = 0; i < count; i++) {
    rows.push({
      number: i + 1,
      amount: installmentValue,
      dueDate: i === 0 ? firstDueDate : addMonthsClamped(firstDueDate, i),
    })
  }
  return rows
}

/**
 * O boleto de uma parcela deve estar disponível ao aluno / ser emitido?
 * Regra: a 1ª parcela (entrada que libera o acesso) fica disponível na hora; as
 * demais só a partir de `INSTALLMENT_REVEAL_WINDOW_DAYS` dias antes do vencimento.
 * Vale tanto para a visibilidade na área do aluno quanto para a emissão do boleto
 * MP pelo cron.
 */
export function isWithinRevealWindow(
  inst: { number: number; dueDate: Date },
  now: Date = new Date(),
): boolean {
  if (inst.number <= 1) return true
  const windowStart = new Date(inst.dueDate)
  windowStart.setUTCDate(windowStart.getUTCDate() - INSTALLMENT_REVEAL_WINDOW_DAYS)
  return now.getTime() >= windowStart.getTime()
}

/** A parcela está vencida e ainda não paga? (base do bloqueio por inadimplência) */
export function isOverdue(
  inst: { dueDate: Date; status: string },
  now: Date = new Date(),
): boolean {
  if (inst.status === "PAID" || inst.status === "CANCELLED") return false
  // Vencida quando passou o fim do dia do vencimento.
  const endOfDue = new Date(inst.dueDate)
  endOfDue.setUTCHours(23, 59, 59, 999)
  return now.getTime() > endOfDue.getTime()
}
