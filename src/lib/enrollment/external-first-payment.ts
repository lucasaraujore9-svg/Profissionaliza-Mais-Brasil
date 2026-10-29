/**
 * Venda de curso mensal cuja 1ª mensalidade foi paga FORA da plataforma (ex.:
 * marketplace de cursos). PURO, sem I/O — a tela, as rotas de venda e os
 * checkouts decidem pelas mesmas funções.
 *
 * A baixa vira um `Payment` comum (mesmo `fulfillEnrollment` do webhook, que
 * libera o curso e conta a 1ª mensalidade), com um id que NÃO existe em gateway
 * nenhum: `ext_<matrícula>`. Por isso todo fluxo que manda um id de pagamento
 * ao gateway (estorno, verificação) precisa pular `isExternalPaymentId`.
 *
 * As mensalidades seguintes:
 *   - Asaas: a mesma assinatura de quando a 1ª é paga na plataforma — o aluno
 *     abre `/pagar/<id>`, cadastra o meio de pagamento, e a assinatura nasce
 *     com o 1º vencimento no MÊS SEGUINTE e só as mensalidades que faltam.
 *   - Mercado Pago: carnê da plataforma (BoletoInstallment) com a 1ª parcela
 *     já paga; o cron emite cada boleto no MP perto do vencimento.
 */
import { addMonthsClampedUtc, brDayStartUtc } from "@/lib/dates"

export const EXTERNAL_PAYMENT_PREFIX = "ext_"

/** Rótulo gravado em `Payment.mpPaymentType` — é como a baixa aparece no extrato. */
export const EXTERNAL_PAYMENT_TYPE = "pagamento_externo"

export function externalPaymentId(enrollmentId: string): string {
  return `${EXTERNAL_PAYMENT_PREFIX}${enrollmentId}`
}

export function isExternalPaymentId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(EXTERNAL_PAYMENT_PREFIX)
}

/** Dias mínimos até o 1º boleto do MP (boleto não pode nascer vencendo hoje). */
const MP_BOLETO_MIN_DAYS = 3

/**
 * Vencimento da 2ª mensalidade: um mês depois do pagamento no marketplace —
 * nunca no passado. Se a venda está sendo cadastrada com atraso, a cobrança vai
 * para hoje (cartão) ou daqui a `minDays` (boleto). Dia civil, meio-dia UTC.
 */
export function nextDueAfterExternal(
  paidAt: Date,
  now: Date = new Date(),
  minDays = 0,
): Date {
  const paidDay = new Date(`${paidAt.toISOString().slice(0, 10)}T12:00:00Z`)
  const oneMonth = addMonthsClampedUtc(paidDay, 1)
  const floor = brDayStartUtc(now)
  floor.setUTCDate(floor.getUTCDate() + minDays)
  floor.setUTCHours(12, 0, 0, 0)
  return oneMonth > floor ? oneMonth : floor
}

export function nextMpBoletoDueAfterExternal(paidAt: Date, now: Date = new Date()): Date {
  return nextDueAfterExternal(paidAt, now, MP_BOLETO_MIN_DAYS)
}

export interface RecurringSetupSource {
  paymentType: string
  gateway: string
  status: string
  finalAmount: number
  installmentsPaid: number
  installmentsTotal: number | null
  asaasSubscriptionId: string | null
  /** `paidAt` do Payment `ext_` desta matrícula; null = não houve baixa externa. */
  externalPaidAt: Date | null
}

/**
 * A matrícula está liberada (1ª mensalidade paga fora) e ainda falta o aluno
 * cadastrar a assinatura das próximas no Asaas? É o que reabre `/pagar/<id>`
 * para uma matrícula ACTIVE.
 */
export function recurringSetupPending(e: RecurringSetupSource): boolean {
  return (
    e.paymentType === "MONTHLY" &&
    e.gateway === "ASAAS" &&
    e.status === "ACTIVE" &&
    e.finalAmount > 0 &&
    e.externalPaidAt !== null &&
    !e.asaasSubscriptionId &&
    (e.installmentsTotal ?? 0) > e.installmentsPaid
  )
}

/** Parâmetros da assinatura que cobra só o que falta. */
export function recurringStart(
  e: RecurringSetupSource,
  now: Date = new Date(),
): { nextDueDate: string; remaining: number } | null {
  if (!recurringSetupPending(e)) return null
  return {
    nextDueDate: nextDueAfterExternal(e.externalPaidAt!, now).toISOString().slice(0, 10),
    remaining: e.installmentsTotal! - e.installmentsPaid,
  }
}
