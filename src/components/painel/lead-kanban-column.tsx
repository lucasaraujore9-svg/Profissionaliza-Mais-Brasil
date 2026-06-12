"use client"

import { useEffect, useRef, useState } from "react"
import { Mail, Phone, BookOpen, MoreVertical, UserRound } from "lucide-react"
import type { LeadCardData } from "./leads-kanban-board"

export type StageKey =
  | "NEW"
  | "CONTACTED"
  | "CHECKOUT_STARTED"
  | "ABANDONED"
  | "WON"
  | "LOST"

export const STAGE_META: Record<
  StageKey,
  { label: string; description: string; color: string; badge: string }
> = {
  NEW: {
    label: "Novos",
    description: "Formulário preenchido na vitrine",
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-800",
  },
  CONTACTED: {
    label: "Em contato",
    description: "Consultor já conversou",
    color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-800",
  },
  CHECKOUT_STARTED: {
    label: "Checkout iniciado",
    description: "Aluno está finalizando compra",
    color: "bg-violet-50 border-violet-200",
    badge: "bg-violet-100 text-violet-800",
  },
  ABANDONED: {
    label: "Abandonados",
    description: "Carrinho não finalizado",
    color: "bg-orange-50 border-orange-200",
    badge: "bg-orange-100 text-orange-800",
  },
  WON: {
    label: "Concluídos",
    description: "Pagamento aprovado",
    color: "bg-emerald-50 border-emerald-200",
    badge: "bg-emerald-100 text-emerald-800",
  },
  LOST: {
    label: "Perdidos",
    description: "Descartados pelo consultor",
    color: "bg-gray-50 border-gray-200",
    badge: "bg-gray-100 text-gray-700",
  },
}

const STAGES: StageKey[] = [
  "NEW",
  "CONTACTED",
  "CHECKOUT_STARTED",
  "ABANDONED",
  "WON",
  "LOST",
]

interface LeadKanbanColumnProps {
  stage: StageKey
  leads: LeadCardData[]
  onSelect: (id: string) => void
  onMove: (id: string, toStage: StageKey) => void
}

export function LeadKanbanColumn({
  stage,
  leads,
  onSelect,
  onMove,
}: LeadKanbanColumnProps) {
  const meta = STAGE_META[stage]
  return (
    <div className={`flex w-72 flex-shrink-0 flex-col rounded-xl border ${meta.color}`}>
      <header className="flex items-center justify-between px-3 pb-2 pt-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
            {meta.label}
          </p>
          <p className="text-[10px] text-gray-500">{meta.description}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}
        >
          {leads.length}
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {leads.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white/60 p-3 text-center text-[11px] text-gray-400">
            Sem leads
          </p>
        )}
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            currentStage={stage}
            onClick={() => onSelect(lead.id)}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  )
}

interface LeadCardProps {
  lead: LeadCardData
  currentStage: StageKey
  onClick: () => void
  onMove: (id: string, toStage: StageKey) => void
}

function LeadCard({ lead, currentStage, onClick, onMove }: LeadCardProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  return (
    <div className="group relative cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-[var(--color-pmb-green)] hover:shadow-md">
      <div
        onClick={onClick}
        className="space-y-1.5"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          // Botões devem ativar com Enter E Espaço (WCAG 2.1 — teclado).
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick()
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-[var(--color-pmb-green-900)] line-clamp-1">
            {lead.nome}
          </h4>
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-600">
            {sourceShort(lead.source)}
          </span>
        </div>
        {lead.courseSnapshot && (
          <p className="flex items-center gap-1 text-[11px] text-gray-600 line-clamp-1">
            <BookOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.courseSnapshot}</span>
          </p>
        )}
        <p className="flex items-center gap-1 text-[11px] text-gray-500">
          <Phone className="h-3 w-3" />
          {lead.telefone}
        </p>
        <p className="flex items-center gap-1 text-[11px] text-gray-500 line-clamp-1">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.email}</span>
        </p>
        {currentStage === "WON" && lead.paymentValue !== null && (
          <p className="text-[11px] font-bold text-emerald-700">
            R$ {lead.paymentValue.toFixed(2).replace(".", ",")}
          </p>
        )}
        {lead.ownerUserId !== undefined && (
          <p className="flex items-center gap-1 pt-0.5 text-[10.5px]">
            <UserRound className="h-3 w-3 shrink-0 text-gray-400" />
            {lead.ownerName ? (
              <span className="truncate font-medium text-gray-600">
                {lead.ownerName}
              </span>
            ) : (
              <span className="italic text-gray-400">Sem responsável</span>
            )}
          </p>
        )}
      </div>

      <div ref={ref} className="absolute right-1 top-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          aria-label="Ações do lead"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase text-gray-400">
              Mover para
            </p>
            {STAGES.filter((s) => s !== currentStage).map((s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onMove(lead.id, s)
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-gray-700 hover:bg-[var(--color-pmb-mist)]"
              >
                {STAGE_META[s].label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function sourceShort(source: string): string {
  if (source === "FORM_COURSE") return "Form"
  if (source === "CHECKOUT_ABANDON") return "Checkout"
  if (source === "MANUAL") return "Manual"
  return source
}
