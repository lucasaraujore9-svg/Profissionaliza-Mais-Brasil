import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"

/**
 * Fonte unica de verdade para status financeiro do painel (revendedor).
 * Consumido por finance-filter-bar (chips de filtro) e finance-payment-table
 * (badges), garantindo que nao haja drift entre o que se filtra e o que se exibe.
 *
 * Tons mapeados conforme o sistema de design PMB (status-badge):
 *  - APPROVED  -> success (verde)
 *  - PENDING / IN_PROCESS -> warning (ouro)  [pendente]
 *  - REJECTED / REFUNDED / CHARGED_BACK -> danger (vermelho)
 *  - CANCELLED -> neutral (cinza)
 */
export interface FinanceStatusMeta {
  label: string
  tone: BadgeTone
}

export const FINANCE_STATUS_META: Record<string, FinanceStatusMeta> = {
  APPROVED: { label: "Pago", tone: "success" },
  PENDING: { label: "Pendente", tone: "warning" },
  IN_PROCESS: { label: "Em análise", tone: "warning" },
  REJECTED: { label: "Rejeitado", tone: "danger" },
  REFUNDED: { label: "Reembolsado", tone: "danger" },
  CHARGED_BACK: { label: "Chargeback", tone: "danger" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
}

const FALLBACK_META: FinanceStatusMeta = { label: "", tone: "neutral" }

export function financeStatusMeta(status: string): FinanceStatusMeta {
  return FINANCE_STATUS_META[status] ?? { ...FALLBACK_META, label: status }
}

export function FinanceStatusBadge({ status }: { status: string }) {
  const { label, tone } = financeStatusMeta(status)
  return (
    <StatusBadge tone={tone} dot>
      {label}
    </StatusBadge>
  )
}
