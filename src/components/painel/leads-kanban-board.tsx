"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { LeadKanbanColumn, STAGE_META, type StageKey } from "./lead-kanban-column"
import { LeadDetailDrawer } from "./lead-detail-drawer"

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
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando leads…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
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
