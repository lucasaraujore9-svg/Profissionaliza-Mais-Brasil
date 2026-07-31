"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { useCan } from "@/components/shared/permissions/permission-context"

export function AdminPayoutRowActions({
  payoutId,
  proofUrl,
}: {
  payoutId: string
  /** Comprovante já anexado a este saque (quando ausente, exige anexar p/ aprovar). */
  proofUrl?: string | null
}) {
  // A tela abre com `indicacoes.view`, mas dar baixa no pagamento é
  // `financeiro.manage` (é o que as rotas de mark-paid/proof/fail exigem). O
  // gerente e o diretor de unidades acompanham os saques da carteira sem serem
  // quem paga — para eles, a linha não tem botão de ação.
  const canSettle = useCan("financeiro.manage")

  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [approveOpen, setApproveOpen] = useState(false)
  const [failOpen, setFailOpen] = useState(false)
  const [transferId, setTransferId] = useState("")
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [reason, setReason] = useState("")

  function approve() {
    // Comprovante obrigatório: arquivo novo OU já anexado.
    if (!proofFile && !proofUrl) {
      toast.error("Anexe o comprovante de pagamento para confirmar.")
      return
    }
    startTransition(async () => {
      // 1) Sobe o comprovante antes de aprovar (backstop server-side exige proofUrl).
      if (proofFile) {
        const fd = new FormData()
        fd.append("file", proofFile)
        const upRes = await fetch(
          `/api/admin/financeiro/referral-payouts/${payoutId}/proof`,
          { method: "POST", body: fd },
        )
        const upBody = await upRes.json().catch(() => ({}))
        if (!upRes.ok) {
          toast.error(upBody.error ?? "Falha ao enviar comprovante")
          return
        }
      }

      const res = await fetch(
        `/api/admin/referrals/payouts/${payoutId}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            asaasTransferId: transferId.trim() || undefined,
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao aprovar")
        return
      }
      toast.success("Saque marcado como pago")
      setApproveOpen(false)
      setTransferId("")
      setProofFile(null)
      router.refresh()
    })
  }

  function fail() {
    if (!reason.trim()) {
      toast.error("Informe o motivo")
      return
    }
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/referrals/payouts/${payoutId}/fail`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao recusar")
        return
      }
      toast.success("Saque recusado")
      setFailOpen(false)
      setReason("")
      router.refresh()
    })
  }

  if (!canSettle) {
    return <span className="text-xs text-gray-400">Aguardando o financeiro</span>
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" onClick={() => setApproveOpen(true)} disabled={pending}>
        Aprovar
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setFailOpen(true)}
        disabled={pending}
      >
        Recusar
      </Button>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar saque</DialogTitle>
            <DialogDescription>
              Confirme o pagamento. Para PIX via Asaas, informe o ID do
              transfer; para desconto na mensalidade, deixe em branco.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>
                Comprovante de pagamento{" "}
                <span className="text-rose-600">*</span>
              </Label>
              <Input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {proofFile
                  ? `Selecionado: ${proofFile.name}`
                  : proofUrl
                    ? "Já há comprovante anexado. Envie outro para substituir, ou confirme para manter."
                    : "Obrigatório. Fica disponível para a revenda consultar."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>ID do transfer Asaas (opcional)</Label>
              <Input
                value={transferId}
                onChange={(e) => setTransferId(e.target.value)}
                placeholder="trf_xxxxx"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={approve} disabled={pending}>
              {pending ? "Processando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar saque</DialogTitle>
            <DialogDescription>
              O valor voltara para o saldo AVAILABLE do indicador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: chave PIX invalida"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={fail} disabled={pending} variant="destructive">
              {pending ? "Enviando..." : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
