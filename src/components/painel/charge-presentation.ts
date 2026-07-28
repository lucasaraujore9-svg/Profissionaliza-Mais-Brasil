/**
 * Vocabulário visual das cobranças da unidade — compartilhado pela listagem, o
 * card do dashboard e o pop-up de vencimento. Um lugar só para que "vence hoje"
 * tenha exatamente a mesma cor e a mesma frase nas três superfícies.
 */
import type { ChargeUrgency, TenantCharge } from "@/lib/tenant-billing/types"

export const URGENCY_STYLE: Record<
  ChargeUrgency,
  { badge: string; ring: string; dot: string }
> = {
  overdue: {
    badge: "bg-rose-100 text-rose-700",
    ring: "border-rose-200 bg-rose-50",
    dot: "bg-rose-500",
  },
  "due-today": {
    badge: "bg-amber-100 text-amber-800",
    ring: "border-amber-200 bg-amber-50",
    dot: "bg-amber-500",
  },
  "due-soon": {
    badge: "bg-amber-50 text-amber-700",
    ring: "border-amber-100 bg-amber-50/60",
    dot: "bg-amber-400",
  },
  scheduled: {
    badge: "bg-gray-100 text-gray-600",
    ring: "border-gray-200 bg-white",
    dot: "bg-gray-300",
  },
}

const BILLING_TYPE_LABEL: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CREDIT_CARD: "Cartão",
  UNDEFINED: "PIX ou boleto",
}

export function billingTypeLabel(billingType: string | null): string {
  if (!billingType) return "Boleto"
  return BILLING_TYPE_LABEL[billingType] ?? billingType
}

/** "Vence em 5 dias" · "Vence hoje" · "Vencido há 3 dias". */
export function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) return "Vence hoje"
  if (daysUntilDue === 1) return "Vence amanhã"
  if (daysUntilDue > 1) return `Vence em ${daysUntilDue} dias`
  const late = Math.abs(daysUntilDue)
  return late === 1 ? "Vencido há 1 dia" : `Vencido há ${late} dias`
}

export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * O vencimento é gravado como meia-noite UTC do dia civil — formatar em UTC
 * evita que o fuso de Brasília puxe a data para o dia anterior.
 */
export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

export function statusLabel(charge: TenantCharge): string {
  if (charge.markedPaid) return "Paga"
  switch (charge.status) {
    case "RECEIVED":
    case "CONFIRMED":
      return "Paga"
    case "OVERDUE":
      return "Vencida"
    case "PENDING":
      return "Em aberto"
    case "REFUNDED":
      return "Estornada"
    default:
      return charge.status
  }
}
