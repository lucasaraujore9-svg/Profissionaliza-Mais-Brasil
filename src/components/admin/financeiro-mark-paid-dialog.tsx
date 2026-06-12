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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type FinanceiroTarget = "tenant-payment" | "referral-payout"

interface FinanceiroMarkPaidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: FinanceiroTarget
  itemId: string
  itemLabel?: string
  itemAmount?: number
  onDone?: () => void
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v)
}

export function FinanceiroMarkPaidDialog({
  open,
  onOpenChange,
  target,
  itemId,
  itemLabel,
  itemAmount,
  onDone,
}: FinanceiroMarkPaidDialogProps) {
  const [paidAt, setPaidAt] = useState(todayISO())
  const [note, setNote] = useState("")
  const [transferId, setTransferId] = useState("")
  const [amount, setAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPaidAt(todayISO())
      setNote("")
      setTransferId("")
      setAmount(typeof itemAmount === "number" ? itemAmount.toFixed(2) : "")
    }
  }, [open, itemAmount])

  async function submit() {
    let parsedAmount: number | undefined
    if (target === "referral-payout") {
      const raw = amount.trim().replace(",", ".")
      if (!raw) {
        toast.error("Informe o valor a pagar")
        return
      }
      const n = Number(raw)
      if (Number.isNaN(n) || n <= 0) {
        toast.error("Valor inválido")
        return
      }
      parsedAmount = Math.round(n * 100) / 100
    }
    setSubmitting(true)
    try {
      const url =
        target === "tenant-payment"
          ? `/api/admin/financeiro/tenant-payments/${itemId}/mark-paid`
          : `/api/admin/financeiro/referral-payouts/${itemId}/mark-paid`

      const body: Record<string, unknown> = {
        note: note.trim() || undefined,
      }
      if (target === "tenant-payment") {
        body.paidAt = paidAt
      } else {
        body.asaasTransferId = transferId.trim() || undefined
        body.amount = parsedAmount
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao marcar como pago")
        return
      }
      toast.success("Marcado como pago")
      onOpenChange(false)
      onDone?.()
    } catch {
      toast.error("Erro de rede ao marcar como pago")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como pago</DialogTitle>
          <DialogDescription>
            {itemLabel ? <>{itemLabel} — </> : null}
            {typeof itemAmount === "number" ? (
              <span className="font-mono font-semibold">
                {formatMoney(itemAmount)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {target === "tenant-payment" ? (
            <div className="space-y-1.5">
              <Label htmlFor="mp-paid-at">Data do pagamento</Label>
              <Input
                id="mp-paid-at"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                max={todayISO()}
              />
              <p className="text-xs text-muted-foreground">
                Default hoje. Use a data real em que o valor entrou.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mp-amount">Valor a pagar</Label>
                <Input
                  id="mp-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">
                  {typeof itemAmount === "number" &&
                  Math.abs(Number(amount.replace(",", ".")) - itemAmount) >
                    0.001 ? (
                    <span className="text-amber-700">
                      Ajuste manual: valor solicitado era{" "}
                      {formatMoney(itemAmount)}.
                    </span>
                  ) : (
                    <>Confirme ou ajuste o valor da recorrência antes de pagar.</>
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-transfer-id">
                  ID transfer Asaas (opcional)
                </Label>
                <Input
                  id="mp-transfer-id"
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  placeholder="trf_xxxxx"
                />
                <p className="text-xs text-muted-foreground">
                  Para saques PIX via Asaas. Para MANUAL/DESCONTO, deixe em
                  branco.
                </p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mp-note">Observação (opcional)</Label>
            <Textarea
              id="mp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: depósito identificado no Banco do Brasil às 14h."
              rows={3}
            />
          </div>
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
            {submitting ? "Salvando..." : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
