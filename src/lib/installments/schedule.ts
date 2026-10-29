/**
 * Núcleo PURO do carnê (venda parcelada no boleto). Sem I/O — só a matemática da
 * agenda de parcelas e as regras de visibilidade/janela. Testável isoladamente.
 */
import { addMonthsClamped } from "@/lib/dates"

/** Dias antes do vencimento em que o boleto da parcela fica disponível ao aluno. */
export const INSTALLMENT_REVEAL_WINDOW_DAYS = 7

/** payment_method_id de boleto default no Mercado Pago (payment_type_id `ticket`). */
export const MP_BOLETO_METHOD_ID = "bolbradesco"

/** Teto de parcelas do carnê na venda direta. */
export const MAX_BOLETO_INSTALLMENTS = 24

/** Mínimo de parcelas para caracterizar um parcelamento. */
export const MIN_BOLETO_INSTALLMENTS = 2

/** Menor valor de UMA parcela — piso do boleto no Asaas. */
export const MIN_INSTALLMENT_AMOUNT = 5

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
 * `amounts` (um valor por parcela) substitui o valor único — é a entrada
 * diferente / parcelas com valores próprios.
 */
export function buildInstallmentSchedule(params: {
  count: number
  installmentValue: number
  firstDueDate: Date
  amounts?: number[]
}): ScheduledInstallment[] {
  const { count, installmentValue, firstDueDate, amounts } = params
  const rows: ScheduledInstallment[] = []
  for (let i = 0; i < count; i++) {
    rows.push({
      number: i + 1,
      amount: amounts?.[i] ?? installmentValue,
      dueDate: i === 0 ? firstDueDate : addMonthsClamped(firstDueDate, i),
    })
  }
  return rows
}

/**
 * Valores por parcela informados pelo vendedor. Devolve a mensagem de erro, ou
 * null se estão válidos: um por parcela, em centavos, nenhum abaixo do piso.
 */
export function installmentAmountsError(
  amounts: number[],
  count: number,
): string | null {
  if (amounts.length !== count) {
    return `Informe o valor de cada uma das ${count} parcelas.`
  }
  for (let i = 0; i < amounts.length; i++) {
    const v = amounts[i]
    if (!Number.isFinite(v) || Math.abs(Math.round(v * 100) - v * 100) > 1e-6) {
      return `Valor da parcela ${i + 1} inválido.`
    }
    if (v < MIN_INSTALLMENT_AMOUNT) {
      return `A parcela ${i + 1} não pode ser menor que R$ ${MIN_INSTALLMENT_AMOUNT},00.`
    }
  }
  return null
}

/** Soma em centavos — evita 0,1 + 0,2 no total da venda. */
export function sumAmounts(amounts: number[]): number {
  return amounts.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100
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
