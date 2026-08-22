"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, PauseCircle, PlayCircle, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

/**
 * Cursos produzidos pelas unidades, na visão da PMB.
 *
 * A publicação é direta (não há fila de aprovação), então esta tela é a
 * intervenção reativa: ver o que a rede colocou no ar e pausar o que não pode
 * continuar. Pausar não mexe em matrícula — quem já comprou mantém o acesso.
 */

interface Row {
  id: string
  nome: string
  slug: string
  authoredStatus: "DRAFT" | "PUBLISHED" | "PAUSED" | null
  distribution: "OWN_ONLY" | "OWN_AND_PMB" | "NETWORK"
  pricingMode: "FIXED" | "MIN_PRICE" | "MIN_PRODUCER_NET"
  authorAmount: number | null
  sellerCommissionPercent: number | null
  platformFeePercent: number | null
  hasContent: boolean
  enrollments: number
  unidade: { id: string; name: string; slug: string } | null
}

const DISTRIBUTION_LABEL: Record<Row["distribution"], string> = {
  OWN_ONLY: "Só a vitrine dela",
  OWN_AND_PMB: "Vitrine dela + PMB",
  NETWORK: "Toda a rede",
}

const PRICING_LABEL: Record<Row["pricingMode"], string> = {
  FIXED: "preço fixo",
  MIN_PRICE: "preço mínimo",
  MIN_PRODUCER_NET: "valor garantido ao produtor",
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function AdminAuthoredCoursesClient({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pausing, setPausing] = useState<Row | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/cursos-autorais")
      if (!res.ok) throw new Error()
      const json = await res.json()
      setRows(json.data)
    } catch {
      setError("Não foi possível carregar os cursos das unidades.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(row: Row, status: "PUBLISHED" | "PAUSED", motivo?: string) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/cursos-autorais/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authoredStatus: status, motivo }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível alterar o curso.")
        return
      }
      toast.success(status === "PAUSED" ? "Curso pausado." : "Curso reativado.")
      setPausing(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Store className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma unidade produziu curso próprio ainda.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        As unidades publicam sem aprovação prévia. Pausar tira o curso das
        vitrines na hora — quem já comprou mantém o acesso.
      </p>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.nome}</span>
                  {row.authoredStatus === "PAUSED" && (
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                      Pausado
                    </span>
                  )}
                  {row.authoredStatus === "DRAFT" && (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      Rascunho
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.unidade?.name ?? "unidade removida"} ·{" "}
                  {DISTRIBUTION_LABEL[row.distribution]} ·{" "}
                  {row.authorAmount !== null && formatBRL(row.authorAmount)}{" "}
                  ({PRICING_LABEL[row.pricingMode]})
                  {row.sellerCommissionPercent !== null &&
                    ` · comissão ${row.sellerCommissionPercent}%`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.enrollments} matrícula(s)
                  {!row.hasContent && " · sem conteúdo cadastrado"}
                </p>
              </div>

              {canManage && (
                <div className="flex gap-2">
                  {row.authoredStatus === "PAUSED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() => void setStatus(row, "PUBLISHED")}
                    >
                      <PlayCircle className="size-4" /> Reativar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === row.id}
                      onClick={() => setPausing(row)}
                    >
                      <PauseCircle className="size-4" /> Pausar
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pausing && (
        <PauseDialog
          row={pausing}
          busy={busyId === pausing.id}
          onClose={() => setPausing(null)}
          onConfirm={(motivo) => void setStatus(pausing, "PAUSED", motivo)}
        />
      )}
    </div>
  )
}

function PauseDialog({
  row,
  busy,
  onClose,
  onConfirm,
}: {
  row: Row
  busy: boolean
  onClose: () => void
  onConfirm: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState("")
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pausar “{row.nome}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            O curso sai de todas as vitrines imediatamente. As {row.enrollments}{" "}
            matrícula(s) existentes continuam com acesso — cortar quem já pagou
            puniria a pessoa errada.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo (vai para a unidade)</Label>
            <Input
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex.: conteúdo incompleto"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(motivo.trim())} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Pausar curso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
