import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"

/**
 * Fonte unica de verdade para o TOM (status-badge) de cada estagio de lead.
 * Usado por leads-kanban-board / lead-kanban-column / lead-detail-drawer para
 * evitar cores cruas (blue/violet/orange/emerald) no Kanban.
 *
 * Tons conforme o sistema de design PMB (status-badge):
 *  - NEW              -> info (ciano)
 *  - CONTACTED        -> warning (ouro)
 *  - CHECKOUT_STARTED -> accent (lima)
 *  - ABANDONED        -> danger (vermelho)
 *  - WON              -> success (verde)
 *  - LOST             -> neutral (cinza)
 */
export type LeadStageKey =
  | "NEW"
  | "CONTACTED"
  | "CHECKOUT_STARTED"
  | "ABANDONED"
  | "WON"
  | "LOST"

export const LEAD_STAGE_TONE: Record<LeadStageKey, BadgeTone> = {
  NEW: "info",
  CONTACTED: "warning",
  CHECKOUT_STARTED: "accent",
  ABANDONED: "danger",
  WON: "success",
  LOST: "neutral",
}

export function leadStageTone(stage: string): BadgeTone {
  return LEAD_STAGE_TONE[stage as LeadStageKey] ?? "neutral"
}

export function LeadStageBadge({
  stage,
  label,
}: {
  stage: string
  label: string
}) {
  return (
    <StatusBadge tone={leadStageTone(stage)} dot>
      {label}
    </StatusBadge>
  )
}
