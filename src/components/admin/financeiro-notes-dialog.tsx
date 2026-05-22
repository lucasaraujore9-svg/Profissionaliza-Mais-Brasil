"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { FinanceiroTarget } from "./financeiro-mark-paid-dialog"

interface FinanceiroNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: FinanceiroTarget
  itemId: string
  itemLabel?: string
  existingNotes?: string | null
  onDone?: () => void
}

interface FailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payoutId: string
  onDone?: () => void
}

export function FinanceiroNotesDialog({
  open,
  onOpenChange,
  target,
  itemId,
  itemLabel,
  existingNotes,
  onDone,
}: FinanceiroNotesDialogProps) {
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setNote("")
  }, [open])

  async function submit() {
    const trimmed = note.trim()
    if (!trimmed) {
      toast.error("Informe a observação")
      return
    }
    setSubmitting(true)
    try {
      const url =
        target === "tenant-payment"
          ? `/api/admin/financeiro/tenant-payments/${itemId}/note`
          : `/api/admin/financeiro/referral-payouts/${itemId}/note`
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao adicionar observação")
        return
      }
      toast.success("Observação adicionada")
      onOpenChange(false)
      onDone?.()
    } catch {
      toast.error("Erro de rede ao salvar observação")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar observação</DialogTitle>
          <DialogDescription>
            {itemLabel ?? "Item financeiro"}
          </DialogDescription>
        </DialogHeader>

        {existingNotes && existingNotes.trim().length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Histórico
            </Label>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700">
              {existingNotes}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="note-input">Nova observação</Label>
          <Textarea
            id="note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: cliente avisou que deposita até sexta."
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Salvando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FinanceiroFailPayoutDialog({
  open,
  onOpenChange,
  payoutId,
  onDone,
}: FailDialogProps) {
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setReason("")
  }, [open])

  async function submit() {
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      toast.error("Informe um motivo (mínimo 3 caracteres)")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/admin/financeiro/referral-payouts/${payoutId}/fail`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: trimmed }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao recusar")
        return
      }
      toast.success("Saque recusado. Comissões voltaram para AVAILABLE.")
      onOpenChange(false)
      onDone?.()
    } catch {
      toast.error("Erro de rede ao recusar saque")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recusar saque</DialogTitle>
          <DialogDescription>
            O valor voltará para o saldo AVAILABLE do indicador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="fail-reason">Motivo</Label>
          <Textarea
            id="fail-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: chave PIX inválida"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting} variant="destructive">
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Enviando..." : "Recusar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
