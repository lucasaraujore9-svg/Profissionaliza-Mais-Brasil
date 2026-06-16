"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Mail,
  Phone,
  MapPin,
  UserPlus,
  UserCog,
  GripVertical,
  MoreVertical,
} from "lucide-react"
import { NewResellerDialog } from "@/components/admin/new-reseller-dialog"
import type { RevendaLead, LeadStatus } from "./leads-revenda-list"

export interface LeadAssigneeOption {
  userId: string
  name: string
  active: boolean
}

// MIME usado no dataTransfer do drag-and-drop nativo dos cards de lead de
// revenda. Distinto do board de StudentLead (Vitrine PMB) p/ não aceitar drop
// cruzado entre os dois kanbans, caso convivam na mesma tela no futuro.
const DRAG_MIME = "application/x-pmb-revenda-lead"

const STATUS_ORDER: LeadStatus[] = ["NEW", "CONTACTED", "CONVERTED", "LOST"]

const STATUS_META: Record<
  LeadStatus,
  { label: string; description: string; color: string; badge: string }
> = {
  NEW: {
    label: "Novos",
    description: "Formulário Seja Revendedor",
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-800",
  },
  CONTACTED: {
    label: "Em contato",
    description: "Equipe já conversou",
    color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-800",
  },
  CONVERTED: {
    label: "Convertidos",
    description: "Viraram revenda",
    color: "bg-emerald-50 border-emerald-200",
    badge: "bg-emerald-100 text-emerald-800",
  },
  LOST: {
    label: "Perdidos",
    description: "Descartados",
    color: "bg-gray-50 border-gray-200",
    badge: "bg-gray-100 text-gray-700",
  },
}

type Board = Record<LeadStatus, RevendaLead[]>

function groupByStatus(leads: RevendaLead[]): Board {
  const board = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = []
    return acc
  }, {} as Board)
  for (const lead of leads) board[lead.status]?.push(lead)
  return board
}

export function LeadsRevendaKanban({
  leads,
  apiBase,
  canConvert = false,
  assignees = [],
}: {
  leads: RevendaLead[]
  apiBase: string
  canConvert?: boolean
  /** Vendedores de revenda para reatribuição (vazio = sem permissão). */
  assignees?: LeadAssigneeOption[]
}) {
  const router = useRouter()
  const [board, setBoard] = useState<Board>(() => groupByStatus(leads))

  // Re-sincroniza quando o server component re-renderiza (router.refresh após
  // mover/converter). A fonte da verdade continua sendo o banco.
  useEffect(() => {
    setBoard(groupByStatus(leads))
  }, [leads])

  const moveLead = useCallback(
    async (leadId: string, toStatus: LeadStatus) => {
      const prev = board
      if (prev[toStatus].some((l) => l.id === leadId)) return // já está lá

      const moved = STATUS_ORDER.flatMap((s) => prev[s]).find(
        (l) => l.id === leadId,
      )
      if (!moved) return

      // optimistic update: card movido vai para o topo da coluna destino
      const next = groupByStatus(
        STATUS_ORDER.flatMap((s) => prev[s]).map((l) =>
          l.id === leadId ? { ...l, status: toStatus } : l,
        ),
      )
      setBoard(next)

      try {
        const res = await fetch(`${apiBase}/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus, columnOrder: 0 }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error(body.error ?? "Falha ao mover lead.")
          setBoard(prev)
          return
        }
        toast.success(`Lead movido para ${STATUS_META[toStatus].label}.`)
        router.refresh()
      } catch {
        toast.error("Erro de conexão. Tente de novo.")
        setBoard(prev)
      }
    },
    [board, apiBase, router],
  )

  const reassignLead = useCallback(
    async (leadId: string, ownerUserId: string | null, ownerName: string | null) => {
      try {
        const res = await fetch(`${apiBase}/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerUserId }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error(body.error ?? "Falha ao atribuir lead.")
          return
        }
        toast.success(
          ownerName ? `Lead atribuído a ${ownerName}.` : "Dono removido do lead.",
        )
        router.refresh()
      } catch {
        toast.error("Erro de conexão. Tente de novo.")
      }
    },
    [apiBase, router],
  )

  return (
    <div className="-mx-2 overflow-x-auto pb-4">
      <div className="flex min-w-max gap-3 px-2">
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            leads={board[status]}
            onMove={moveLead}
            canConvert={canConvert}
            onConverted={() => router.refresh()}
            assignees={assignees}
            onReassign={reassignLead}
          />
        ))}
      </div>
    </div>
  )
}

interface ColumnProps {
  status: LeadStatus
  leads: RevendaLead[]
  onMove: (id: string, toStatus: LeadStatus) => void
  canConvert: boolean
  onConverted: () => void
  assignees: LeadAssigneeOption[]
  onReassign: (id: string, ownerUserId: string | null, ownerName: string | null) => void
}

function KanbanColumn({
  status,
  leads,
  onMove,
  canConvert,
  onConverted,
  assignees,
  onReassign,
}: ColumnProps) {
  const meta = STATUS_META[status]
  const [isOver, setIsOver] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (!isOver) setIsOver(true)
  }

  function handleDrop(e: React.DragEvent) {
    const id = e.dataTransfer.getData(DRAG_MIME)
    setIsOver(false)
    if (!id) return
    e.preventDefault()
    onMove(id, status)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      className={`flex w-72 flex-shrink-0 flex-col rounded-xl border transition ${meta.color} ${
        isOver
          ? "border-[var(--color-pmb-green)] ring-2 ring-[var(--color-pmb-green)]/40"
          : ""
      }`}
    >
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
          <KanbanCard
            key={lead.id}
            lead={lead}
            currentStatus={status}
            onMove={onMove}
            canConvert={canConvert}
            onConverted={onConverted}
            assignees={assignees}
            onReassign={onReassign}
          />
        ))}
      </div>
    </div>
  )
}

interface CardProps {
  lead: RevendaLead
  currentStatus: LeadStatus
  onMove: (id: string, toStatus: LeadStatus) => void
  canConvert: boolean
  onConverted: () => void
  assignees: LeadAssigneeOption[]
  onReassign: (id: string, ownerUserId: string | null, ownerName: string | null) => void
}

function KanbanCard({
  lead,
  currentStatus,
  onMove,
  canConvert,
  onConverted,
  assignees,
  onReassign,
}: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [menuOpen])

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(DRAG_MIME, lead.id)
    e.dataTransfer.effectAllowed = "move"
    setDragging(true)
  }

  const alreadyConverted =
    lead.status === "CONVERTED" || Boolean(lead.convertedTenantId)
  const showConvert = canConvert && !alreadyConverted

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      className={`group relative rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-[var(--color-pmb-green)] hover:shadow-md ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="cursor-grab space-y-1.5 active:cursor-grabbing">
        <div className="flex items-start justify-between gap-2 pr-5">
          <h4 className="flex items-center gap-1 text-sm font-semibold text-[var(--color-pmb-green-900)]">
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition group-hover:opacity-100" />
            <span className="line-clamp-1">{lead.companyName}</span>
          </h4>
        </div>

        <p className="flex items-center gap-1 text-[11px] text-gray-500">
          <Phone className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.phone || "—"}</span>
        </p>
        <p className="flex items-center gap-1 text-[11px] text-gray-500">
          <Mail className="h-3 w-3 shrink-0" />
          <a
            href={`mailto:${lead.email}`}
            className="truncate hover:text-[var(--color-pmb-green)]"
            onClick={(e) => e.stopPropagation()}
          >
            {lead.email}
          </a>
        </p>
        {(lead.city || lead.state) && (
          <p className="flex items-center gap-1 text-[11px] text-gray-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {[lead.city, lead.state].filter(Boolean).join("/")}
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-1 pt-0.5">
          {lead.plan && (
            <span className="rounded-full bg-[var(--color-pmb-lime-50)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green)]">
              {lead.plan}
            </span>
          )}
          {/* Unidade indicada: revendedor dono do código de indicação digitado
              no formulário. Só aparece quando houve indicação. */}
          {lead.referrerName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <UserPlus className="h-3 w-3" aria-hidden />
              Indicado por {lead.referrerName}
            </span>
          )}
          {/* Vendedor de revenda dono do lead (rodízio ou atribuição manual). */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              lead.ownerName
                ? "bg-indigo-50 text-indigo-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <UserCog className="h-3 w-3" aria-hidden />
            {lead.ownerName ?? "Sem dono"}
          </span>
        </div>
      </div>

      {showConvert && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <NewResellerDialog
            onCreated={onConverted}
            leadId={lead.id}
            triggerLabel="Converter em revenda"
            triggerVariant="outline"
            initialValues={{
              name: lead.companyName,
              ownerName: lead.companyName,
              ownerEmail: lead.email,
              ownerPhone: lead.phone,
            }}
          />
        </div>
      )}

      <div ref={menuRef} className="absolute right-1 top-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          aria-label="Mover lead"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase text-gray-400">
              Mover para
            </p>
            {STATUS_ORDER.filter((s) => s !== currentStatus).map((s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  onMove(lead.id, s)
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-gray-700 hover:bg-[var(--color-pmb-mist)]"
              >
                {STATUS_META[s].label}
              </button>
            ))}

            {assignees.length > 0 && (
              <>
                <p className="mt-1 border-t border-gray-100 px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase text-gray-400">
                  Atribuir a
                </p>
                {assignees.map((a) => (
                  <button
                    key={a.userId}
                    disabled={a.userId === lead.ownerUserId}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      onReassign(lead.id, a.userId, a.name)
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-gray-700 hover:bg-[var(--color-pmb-mist)] disabled:cursor-default disabled:font-semibold disabled:text-[var(--color-pmb-green)]"
                  >
                    {a.name}
                    {!a.active && (
                      <span className="ml-1 text-[10px] text-gray-400">(convite pendente)</span>
                    )}
                  </button>
                ))}
                {lead.ownerUserId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      onReassign(lead.id, null, null)
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-red-600 hover:bg-red-50"
                  >
                    Remover dono
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
