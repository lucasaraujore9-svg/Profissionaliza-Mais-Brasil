import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"

/**
 * Fonte unica de verdade para status de venda/matricula no painel (revendedor).
 * Consumido por recent-sales (dashboard) e a tabela de vendas, garantindo
 * vocabulario e cores identicos (sem drift de label entre as telas).
 *
 * Tons conforme o sistema de design PMB (status-badge):
 *  - PENDING            -> warning (ouro)
 *  - ACTIVE / COMPLETED -> success (verde)
 *  - SUSPENDED          -> danger (vermelho)
 *  - CANCELLED          -> neutral (cinza)
 */
export interface SaleStatusMeta {
  label: string
  tone: BadgeTone
}

export const SALE_STATUS_META: Record<string, SaleStatusMeta> = {
  PENDING: { label: "Pendente", tone: "warning" },
  ACTIVE: { label: "Ativa", tone: "success" },
  COMPLETED: { label: "Concluída", tone: "success" },
  SUSPENDED: { label: "Suspensa", tone: "danger" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  // Status de ASSINATURA. A tabela de vendas diretas passou a listar assinatura
  // ao lado de matrícula; sem estas duas linhas o badge imprimiria o valor cru
  // do enum ("PAST_DUE") na tela do vendedor.
  PAST_DUE: { label: "Em atraso", tone: "danger" },
  EXPIRED: { label: "Expirada", tone: "neutral" },
}

const FALLBACK_META: SaleStatusMeta = { label: "", tone: "neutral" }

export function saleStatusMeta(status: string): SaleStatusMeta {
  return SALE_STATUS_META[status] ?? { ...FALLBACK_META, label: status }
}

export function SaleStatusBadge({ status }: { status: string }) {
  const { label, tone } = saleStatusMeta(status)
  return (
    <StatusBadge tone={tone} dot>
      {label}
    </StatusBadge>
  )
}
