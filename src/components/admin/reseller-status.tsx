import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"

/**
 * Badge de status unico para revendas (tenant) e suas faturas Asaas, sobre o
 * StatusBadge compartilhado. Substitui os mapas hardcoded duplicados em tabela,
 * perfil, historico de pagamentos, comissoes, acoes e barra de stats.
 *
 * Aceita tanto os status de Tenant (ACTIVE/PENDING/SUSPENDED/CANCELLED) quanto
 * os de fatura Asaas (RECEIVED/CONFIRMED/OVERDUE/REFUNDED/DELETED). Status
 * desconhecido cai em neutral.
 */
const TONE_MAP: Record<string, BadgeTone> = {
  // Tenant
  ACTIVE: "success",
  PENDING: "warning",
  SUSPENDED: "danger",
  CANCELLED: "neutral",
  // Asaas payment
  RECEIVED: "success",
  CONFIRMED: "success",
  OVERDUE: "danger",
  REFUNDED: "info",
  DELETED: "neutral",
  DELETING: "warning",
}

const LABEL_MAP: Record<string, string> = {
  ACTIVE: "ativo",
  PENDING: "pendente",
  SUSPENDED: "suspenso",
  CANCELLED: "cancelado",
  RECEIVED: "pago",
  CONFIRMED: "confirmado",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
  DELETED: "cancelado",
  DELETING: "apagando…",
}

interface ResellerStatusBadgeProps {
  status: string
  className?: string
}

export function ResellerStatusBadge({
  status,
  className,
}: ResellerStatusBadgeProps) {
  const key = status.toUpperCase()
  const tone = TONE_MAP[key] ?? "neutral"
  const label = LABEL_MAP[key] ?? status.toLowerCase()
  return (
    <StatusBadge tone={tone} className={className}>
      {label}
    </StatusBadge>
  )
}
