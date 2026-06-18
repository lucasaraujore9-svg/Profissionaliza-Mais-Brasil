"use client"

import { useEffect, useState } from "react"
import { Loader2, Paperclip, Upload } from "lucide-react"
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
import { cn } from "@/lib/utils"

export type FinanceiroTarget = "tenant-payment" | "referral-payout"

interface FinanceiroMarkPaidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: FinanceiroTarget
  itemId: string
  itemLabel?: string
  itemAmount?: number
  /** Comprovante já anexado (só para referral-payout). Quando ausente, exige anexar. */
  existingProofUrl?: string | null
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
  existingProofUrl,
  onDone,
}: FinanceiroMarkPaidDialogProps) {
  const [paidAt, setPaidAt] = useState(todayISO())
  const [note, setNote] = useState("")
  const [transferId, setTransferId] = useState("")
  const [amount, setAmount] = useState("")
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Marca o primeiro submit inválido para acionar aria-invalid nos campos.
  const [showErrors, setShowErrors] = useState(false)

  // Comprovante é obrigatório para saques de comissão (referral-payout).
  const requiresProof = target === "referral-payout"

  // Validações derivadas (para feedback inline além do toast).
  const amountInvalid =
    target === "referral-payout" &&
    (() => {
      const raw = amount.trim().replace(",", ".")
      if (!raw) return true
      const n = Number(raw)
      return Number.isNaN(n) || n <= 0
    })()
  const proofInvalid = requiresProof && !proofFile && !existingProofUrl

  useEffect(() => {
    if (open) {
      setPaidAt(todayISO())
      setNote("")
      setTransferId("")
      setProofFile(null)
      setShowErrors(false)
      setAmount(typeof itemAmount === "number" ? itemAmount.toFixed(2) : "")
    }
  }, [open, itemAmount])

  async function submit() {
    let parsedAmount: number | undefined
    if (target === "referral-payout") {
      const raw = amount.trim().replace(",", ".")
      if (!raw) {
        setShowErrors(true)
        toast.error("Informe o valor a pagar")
        return
      }
      const n = Number(raw)
      if (Number.isNaN(n) || n <= 0) {
        setShowErrors(true)
        toast.error("Valor inválido")
        return
      }
      parsedAmount = Math.round(n * 100) / 100
    }

    // Comprovante obrigatório: precisa ter um arquivo novo OU já existir anexado.
    if (requiresProof && !proofFile && !existingProofUrl) {
      setShowErrors(true)
      toast.error("Anexe o comprovante de pagamento para confirmar.")
      return
    }

    setSubmitting(true)
    try {
      // 1) Sobe o comprovante (se um arquivo foi escolhido) ANTES de marcar pago,
      // para que o backstop server-side (proofUrl obrigatório) seja satisfeito.
      if (requiresProof && proofFile) {
        const fd = new FormData()
        fd.append("file", proofFile)
        const upRes = await fetch(
          `/api/admin/financeiro/referral-payouts/${itemId}/proof`,
          { method: "POST", body: fd },
        )
        const upData = await upRes.json().catch(() => ({}))
        if (!upRes.ok) {
          toast.error(upData.error ?? "Falha ao enviar comprovante")
          return
        }
      }

      // 2) Marca como pago.
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
                  aria-invalid={showErrors && amountInvalid}
                />
                {showErrors && amountInvalid ? (
                  <p className="text-xs font-medium text-destructive">
                    Informe um valor maior que zero.
                  </p>
                ) : typeof itemAmount === "number" &&
                  Math.abs(Number(amount.replace(",", ".")) - itemAmount) >
                    0.001 ? (
                  <p className="rounded-md bg-[var(--color-pmb-gold)]/10 px-2 py-1 text-xs font-medium text-[var(--color-pmb-gold-600)]">
                    Ajuste manual: valor solicitado era{" "}
                    {formatMoney(itemAmount)}.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Confirme ou ajuste o valor da recorrência antes de pagar.
                  </p>
                )}
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

          {requiresProof && (
            <div className="space-y-1.5">
              <Label htmlFor="mp-proof">
                Comprovante de pagamento{" "}
                <span className="text-destructive">*</span>
              </Label>
              <label
                htmlFor="mp-proof"
                aria-invalid={showErrors && proofInvalid}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center transition-colors hover:bg-muted/50",
                  proofFile
                    ? "border-[var(--color-pmb-green)]/40 bg-[var(--color-pmb-lime-50)]"
                    : "border-input",
                  showErrors &&
                    proofInvalid &&
                    "border-destructive/60 bg-destructive/5",
                )}
              >
                {proofFile ? (
                  <Paperclip className="size-5 text-[var(--color-pmb-green)]" />
                ) : (
                  <Upload className="size-5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-foreground">
                  {proofFile
                    ? proofFile.name
                    : existingProofUrl
                      ? "Substituir comprovante (opcional)"
                      : "Clique para anexar o comprovante"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  PDF, PNG, JPG ou WEBP
                </span>
                <Input
                  id="mp-proof"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {showErrors && proofInvalid ? (
                <p className="text-xs font-medium text-destructive">
                  Anexe o comprovante para confirmar o pagamento.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {existingProofUrl
                    ? "Já há um comprovante anexado. Envie outro para substituir, ou confirme para manter."
                    : "Obrigatório. Fica disponível para a revenda consultar."}
                </p>
              )}
            </div>
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
