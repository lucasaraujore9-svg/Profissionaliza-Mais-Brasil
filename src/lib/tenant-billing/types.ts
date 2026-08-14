/**
 * Tipos e regras PURAS das cobranças que a unidade paga para a PMB.
 *
 * Separado de `charges.ts` de propósito: aquele arquivo fala com o Prisma, e o
 * pop-up de vencimento é um componente de cliente. Sem esta fronteira, importar
 * um tipo no cliente arrastaria o driver `pg` para o bundle do navegador (o
 * build quebra explicitamente nisso). Aqui não entra nada que toque o banco.
 */
import { daysUntilBrDay } from "@/lib/dates"

/** Cobranças que ainda pedem ação da unidade. */
export const OPEN_STATUSES = ["PENDING", "OVERDUE"] as const
/** Cobranças liquidadas (histórico). */
export const PAID_STATUSES = ["RECEIVED", "CONFIRMED"] as const

/**
 * Janelas de aviso, em dias antes do vencimento. 0 = no dia. Usada tanto pelo
 * cron (quando disparar) quanto pela UI (a partir de quando destacar).
 */
export const REMINDER_OFFSETS = [5, 2, 0] as const
/** Maior janela: a partir daqui a cobrança já aparece como "a vencer". */
export const ALERT_WINDOW_DAYS = Math.max(...REMINDER_OFFSETS)

export type ChargeUrgency = "overdue" | "due-today" | "due-soon" | "scheduled"

export interface TenantCharge {
  id: string
  asaasPaymentId: string
  amount: number
  billingType: string | null
  status: string
  dueDate: string
  paidAt: string | null
  /** Fatura do Asaas (página de pagamento com PIX/boleto/cartão). */
  invoiceUrl: string | null
  /** PDF do boleto, quando a cobrança é boleto. */
  bankSlipUrl: string | null
  /** Positivo = falta N dias · 0 = vence hoje · negativo = venceu há N dias. */
  daysUntilDue: number
  urgency: ChargeUrgency
  /** Marcada como paga manualmente pelo financeiro da PMB. */
  markedPaid: boolean
}

export interface TenantBillingSummary {
  /** PENDING/OVERDUE, do vencimento mais próximo para o mais distante. */
  open: TenantCharge[]
  /** Últimas pagas, da mais recente para a mais antiga. */
  paid: TenantCharge[]
  openCount: number
  openAmount: number
  overdueCount: number
  overdueAmount: number
  /** Próxima cobrança a vencer (ou a vencida mais antiga, se houver atraso). */
  next: TenantCharge | null
  /** Cobranças dentro da janela de aviso (≤5 dias) ou já vencidas. */
  alerts: TenantCharge[]
}

/** Formato cru vindo do banco — só o que a conversão precisa. */
export interface ChargeRow {
  id: string
  asaasPaymentId: string
  amount: unknown
  billingType: string | null
  status: string
  dueDate: Date
  paidAt: Date | null
  invoiceUrl: string | null
  bankSlipUrl: string | null
  markedPaidAt: Date | null
}

/**
 * "Vencida há 12 dias" / "Vence hoje" / "Vence em 3 dias".
 *
 * Deriva da DATA, não do `status` do Asaas — o status só vira OVERDUE quando o
 * webhook chega, e até lá um boleto vencido ontem se anunciaria como "a vencer".
 * Mora aqui (módulo puro) porque a tabela do /admin e a planilha de export
 * precisam dizer a mesma frase; duas cópias divergiriam no primeiro ajuste.
 */
export function situacaoCobranca(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const dias = Math.abs(daysUntilDue)
    return `Vencida há ${dias} ${dias === 1 ? "dia" : "dias"}`
  }
  if (daysUntilDue === 0) return "Vence hoje"
  return `Vence em ${daysUntilDue} ${daysUntilDue === 1 ? "dia" : "dias"}`
}

export function urgencyOf(daysUntilDue: number): ChargeUrgency {
  if (daysUntilDue < 0) return "overdue"
  if (daysUntilDue === 0) return "due-today"
  if (daysUntilDue <= ALERT_WINDOW_DAYS) return "due-soon"
  return "scheduled"
}

export function toCharge(row: ChargeRow, now: Date = new Date()): TenantCharge {
  // `status` do Asaas só vira OVERDUE quando o webhook chega; a data manda.
  // Sem isso, um boleto vencido ontem cujo PAYMENT_OVERDUE não chegou apareceria
  // como "a vencer" — exatamente o silêncio que este recurso existe para acabar.
  const daysUntilDue = daysUntilBrDay(row.dueDate, now)
  return {
    id: row.id,
    asaasPaymentId: row.asaasPaymentId,
    amount: Number(row.amount),
    billingType: row.billingType,
    status: row.status,
    dueDate: row.dueDate.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    invoiceUrl: row.invoiceUrl,
    bankSlipUrl: row.bankSlipUrl,
    daysUntilDue,
    urgency: urgencyOf(daysUntilDue),
    markedPaid: row.markedPaidAt !== null,
  }
}

/**
 * Link para a unidade pagar. Preferimos a nossa página de cobrança
 * (/cobranca/[asaasPaymentId]) — ela oferece PIX, boleto e cartão, e é onde o
 * parcelamento da 1ª mensalidade vive.
 */
export function payUrlFor(charge: Pick<TenantCharge, "asaasPaymentId">): string {
  return `/cobranca/${charge.asaasPaymentId}`
}
