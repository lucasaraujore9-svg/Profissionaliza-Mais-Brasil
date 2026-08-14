import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"
import { tenantStatusLabel } from "@/lib/labels"

/**
 * Badge de status unico para revendas (tenant) e suas faturas Asaas, sobre o
 * StatusBadge compartilhado. Substitui os mapas hardcoded duplicados em tabela,
 * perfil, historico de pagamentos, comissoes, acoes e barra de stats.
 *
 * Aceita tanto os status de Tenant (ACTIVE/PENDING/SUSPENDED/CANCELLED) quanto
 * os de fatura Asaas (RECEIVED/CONFIRMED/OVERDUE/REFUNDED/DELETED). Status
 * desconhecido cai em neutral.
 *
 * O ROTULO vem de `tenantStatusLabel` (fonte unica em lib/labels) — o mapa que
 * vivia aqui era a segunda copia, e o export de revendedores seria a terceira.
 * So o TOM continua local: e decisao visual, nao traducao.
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
  const label = tenantStatusLabel(key).toLowerCase()
  return (
    <StatusBadge tone={tone} className={className}>
      {label}
    </StatusBadge>
  )
}
