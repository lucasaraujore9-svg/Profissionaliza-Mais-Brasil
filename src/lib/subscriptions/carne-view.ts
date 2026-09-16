import type {
  InstallmentCarne,
  InstallmentView,
} from "@/components/aluno/installments-section"
import {
  INSTALLMENT_REVEAL_WINDOW_DAYS,
  isOverdue,
  isWithinRevealWindow,
} from "@/lib/installments/schedule"
import { CARNE_STATUS } from "./carne-schedule"

/**
 * Boletos de uma assinatura no boleto, no MESMO formato do carne de curso — a
 * lista da area do aluno e da pagina de pagamento e o mesmo componente, com as
 * mesmas regras de visibilidade (o 1o na hora, os demais 7 dias antes).
 *
 * `invoiceUrl` da view e o PDF do BOLETO (`bankSlipUrl`), nunca a fatura
 * hospedada do Asaas: o aluno paga dentro da nossa pagina.
 */

export interface CarneRowForView {
  number: number | null
  amount: unknown
  dueDate: Date
  status: string
  paidAt: Date | null
  bankSlipUrl: string | null
  digitableLine: string | null
}

/** Quantos boletos JA PAGOS a lista mostra — a assinatura renova para sempre. */
const PAID_ROWS_SHOWN = 3

function viewStatus(row: CarneRowForView, now: Date): InstallmentView["status"] {
  if (row.paidAt) return "PAID"
  if (row.status === CARNE_STATUS.CANCELLED) return "CANCELLED"
  if (row.status === CARNE_STATUS.OVERDUE) return "OVERDUE"
  if (row.status === CARNE_STATUS.SCHEDULED) {
    return isOverdue({ dueDate: row.dueDate, status: row.status }, now)
      ? "OVERDUE"
      : "SCHEDULED"
  }
  return isOverdue({ dueDate: row.dueDate, status: row.status }, now)
    ? "OVERDUE"
    : "GENERATED"
}

export function subscriptionCarneView(
  subscription: { id: string; planName: string },
  rows: CarneRowForView[],
  now: Date = new Date(),
): InstallmentCarne | null {
  const numbered = rows
    .filter(
      (r): r is CarneRowForView & { number: number } =>
        r.number !== null && r.status !== CARNE_STATUS.CANCELLED,
    )
    .sort((a, b) => a.number - b.number)
  if (numbered.length === 0) return null

  const paid = numbered.filter((r) => r.paidAt)
  const keepPaid = new Set(paid.slice(-PAID_ROWS_SHOWN).map((r) => r.number))
  const shown = numbered.filter((r) => !r.paidAt || keepPaid.has(r.number))

  return {
    id: subscription.id,
    courseName: subscription.planName,
    unitLabel: "Boleto",
    parcelas: shown.map((row) => {
      const inWindow = isWithinRevealWindow(
        { number: row.number, dueDate: row.dueDate },
        now,
      )
      let availableFromISO: string | null = null
      if (!inWindow) {
        const from = new Date(row.dueDate)
        from.setUTCDate(from.getUTCDate() - INSTALLMENT_REVEAL_WINDOW_DAYS)
        availableFromISO = from.toISOString()
      }
      return {
        number: row.number,
        amount: Number(row.amount),
        dueDateISO: row.dueDate.toISOString(),
        status: viewStatus(row, now),
        available: !row.paidAt && inWindow,
        availableFromISO,
        invoiceUrl: row.bankSlipUrl,
        digitableLine: row.digitableLine,
      }
    }),
  }
}
