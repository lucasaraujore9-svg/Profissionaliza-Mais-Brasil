"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Users } from "lucide-react"
import { LeadKanbanColumn } from "./lead-kanban-column"
import { LeadDetailDrawer } from "./lead-detail-drawer"
import { STAGE_META, type StageKey, type LeadCardData } from "./lead-kanban.shared"
import { BlockSkeleton } from "@/components/shared/loading-skeletons"
import { EmptyState } from "@/components/shared/empty-state"

type BoardData = Record<StageKey, LeadCardData[]>

const STAGE_ORDER: StageKey[] = [
  "NEW",
  "CONTACTED",
  "CHECKOUT_STARTED",
  "ABANDONED",
  "WON",
  "LOST",
]

function emptyBoard(): BoardData {
  return STAGE_ORDER.reduce((acc, s) => {
    acc[s] = []
    return acc
  }, {} as BoardData)
}

interface LeadsKanbanBoardProps {
  /** Base da API de leads. Default = painel revendedor. PMB usa "/api/admin/leads". */
  apiBase?: string
}

export function LeadsKanbanBoard({
  apiBase = "/api/painel/leads",
}: LeadsKanbanBoardProps = {}) {
  const [board, setBoard] = useState<BoardData>(emptyBoard())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiBase, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar leads")
        return
      }
      setBoard(body.data as BoardData)
    } catch {
      setError("Erro de rede ao carregar leads")
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    load()
  }, [load])

  const moveLead = useCallback(
    async (leadId: string, toStage: StageKey) => {
      const prev = board
      // No-op se o lead já está na coluna de destino (ex.: drop na mesma coluna).
      if (prev[toStage].some((l) => l.id === leadId)) return
      // optimistic update
      const next = emptyBoard()
      for (const s of STAGE_ORDER) {
        next[s] = prev[s].filter((l) => l.id !== leadId)
      }
      const moved = STAGE_ORDER.flatMap((s) => prev[s]).find((l) => l.id === leadId)
      if (moved) {
        next[toStage] = [{ ...moved, stage: toStage }, ...next[toStage]]
      }
      setBoard(next)

      try {
        const res = await fetch(`${apiBase}/${leadId}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: toStage }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error(body.error ?? "Falha ao mover lead")
          setBoard(prev)
          return
        }
        toast.success(`Lead movido para ${STAGE_META[toStage].label}`)
      } catch {
        toast.error("Erro de rede")
        setBoard(prev)
      }
    },
    [board, apiBase],
  )

  if (loading) {
    return (
      <div className="-mx-2 overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3 px-2">
          {STAGE_ORDER.map((stage) => (
            <BlockSkeleton key={stage} className="h-72 w-72 flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    )
  }

  const totalLeads = STAGE_ORDER.reduce((acc, s) => acc + board[s].length, 0)

  if (totalLeads === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum lead por aqui ainda"
        description="Leads gerados pela vitrine, formulários de curso e checkouts abandonados aparecem neste quadro."
      />
    )
  }

  return (
    <>
      <div className="-mx-2 overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3 px-2">
          {STAGE_ORDER.map((stage) => (
            <LeadKanbanColumn
              key={stage}
              stage={stage}
              leads={board[stage]}
              onSelect={setSelectedId}
              onMove={moveLead}
            />
          ))}
        </div>
      </div>

      <LeadDetailDrawer
        leadId={selectedId}
        apiBase={apiBase}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
    </>
  )
}
