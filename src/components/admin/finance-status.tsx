import {
  StatusBadge,
  type BadgeTone,
} from "@/components/shared/status-badge"

/**
 * Badge único de status para o cluster Financeiro do admin. Mapeia os vários
 * enums (pagamentos Asaas, saques de comissão, comissões individuais) para os
 * tons da marca via StatusBadge — nunca cores cruas emerald/amber/rose/blue.
 *
 *   pago / recebido / confirmado / disponível  -> success (verde)
 *   pendente / solicitado / trial               -> warning (ouro)
 *   processando (PROCESSING) / manual           -> info (ciano)
 *   vencido / atrasado / recusado / estorno     -> danger (vermelho)
 *   cancelado / inativo                          -> neutral (cinza)
 */

const TONE_BY_STATUS: Record<string, BadgeTone> = {
  // Pagamentos de mensalidade (Asaas)
  RECEIVED: "success",
  CONFIRMED: "success",
  PENDING: "warning",
  OVERDUE: "danger",
  REFUNDED: "danger",
  // Saques de comissão (ReferralPayout)
  REQUESTED: "warning",
  PROCESSING: "info",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  // Comissões individuais (ReferralCommission)
  AVAILABLE: "success",
}

const LABEL_BY_STATUS: Record<string, string> = {
  RECEIVED: "pago",
  CONFIRMED: "confirmado",
  PENDING: "pendente",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
  REQUESTED: "solicitado",
  PROCESSING: "processando",
  PAID: "pago",
  FAILED: "recusado",
  CANCELLED: "cancelado",
  AVAILABLE: "disponível",
}

/** Tom da marca para um status financeiro (default: neutral). */
export function financeStatusTone(status: string): BadgeTone {
  return TONE_BY_STATUS[status.toUpperCase()] ?? "neutral"
}

/** Rótulo pt-BR para um status financeiro (fallback: status em minúsculas). */
export function financeStatusLabel(status: string): string {
  return LABEL_BY_STATUS[status.toUpperCase()] ?? status.toLowerCase()
}

interface FinanceStatusBadgeProps {
  status: string
  /** Sobrescreve o rótulo derivado (ex.: status já traduzido). */
  label?: string
  className?: string
}

export function FinanceStatusBadge({
  status,
  label,
  className,
}: FinanceStatusBadgeProps) {
  return (
    <StatusBadge tone={financeStatusTone(status)} className={className}>
      {label ?? financeStatusLabel(status)}
    </StatusBadge>
  )
}

/** Badge de origem MANUAL vs ASAAS — info (ciano) para manual, neutral p/ Asaas. */
export function FinanceOriginBadge({
  origin,
}: {
  origin: "MANUAL" | "ASAAS"
}) {
  return (
    <StatusBadge tone={origin === "MANUAL" ? "info" : "neutral"} dot={false}>
      {origin === "MANUAL" ? "Manual" : "Asaas"}
    </StatusBadge>
  )
}
