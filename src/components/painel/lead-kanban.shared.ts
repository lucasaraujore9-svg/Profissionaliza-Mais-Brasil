// Tipos e metadados COMPARTILHADOS do kanban de leads. Extraídos para um módulo
// folha (sem JSX, sem imports de componentes) para quebrar a dependência
// circular entre `leads-kanban-board`, `lead-kanban-column` e
// `lead-detail-drawer` (COD-004): antes o board importava STAGE_META da column e
// a column importava o tipo LeadCardData de volta do board.

export type StageKey =
  | "NEW"
  | "CONTACTED"
  | "CHECKOUT_STARTED"
  | "ABANDONED"
  | "WON"
  | "LOST"

export interface LeadCardData {
  id: string
  nome: string
  email: string
  telefone: string
  courseSnapshot: string | null
  stage: StageKey
  source: string
  paymentValue: number | null
  columnOrder: number
  createdAt: string
  // Ausentes no board do admin PMB (sem consultores); presentes no painel da
  // revenda — `null` significa lead sem responsável atribuído.
  ownerUserId?: string | null
  ownerName?: string | null
}

// Tom de cada coluna derivado do sistema de design PMB (status-badge):
// classe de fundo/borda da coluna (`color`) + chip de contagem (`badge`).
// Sem cores cruas (blue/violet/orange/emerald) — tudo via tokens PMB.
export const STAGE_META: Record<
  StageKey,
  { label: string; description: string; color: string; badge: string }
> = {
  NEW: {
    label: "Novos",
    description: "Formulário preenchido na vitrine",
    color: "bg-[var(--color-pmb-cyan-50)] border-[var(--color-pmb-cyan)]/25",
    badge: "bg-[var(--color-pmb-cyan-50)] text-[var(--color-pmb-cyan-700)]",
  },
  CONTACTED: {
    label: "Em contato",
    description: "Consultor já conversou",
    color: "bg-[var(--color-pmb-gold-50)] border-[var(--color-pmb-gold)]/30",
    badge: "bg-[var(--color-pmb-gold)]/15 text-[var(--color-pmb-gold-600)]",
  },
  CHECKOUT_STARTED: {
    label: "Checkout iniciado",
    description: "Aluno está finalizando compra",
    color: "bg-[var(--color-pmb-lime-50)] border-[var(--color-pmb-green)]/20",
    badge: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]",
  },
  ABANDONED: {
    label: "Abandonados",
    description: "Carrinho não finalizado",
    color: "bg-rose-50 border-rose-200",
    badge: "bg-rose-50 text-rose-700",
  },
  WON: {
    label: "Concluídos",
    description: "Pagamento aprovado",
    color: "bg-[var(--color-pmb-green)]/5 border-[var(--color-pmb-green)]/25",
    badge: "bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green-700)]",
  },
  LOST: {
    label: "Perdidos",
    description: "Descartados pelo consultor",
    color: "bg-gray-50 border-gray-200",
    badge: "bg-gray-100 text-gray-700",
  },
}
