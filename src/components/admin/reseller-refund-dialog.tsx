"use client"

import { useState } from "react"
import { Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const INPUT =
  "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"

/**
 * Registra o ESTORNO de uma mensalidade.
 *
 * O estorno acontece fora daqui (PIX de devolucao, painel do Asaas); esta tela o
 * REGISTRA — por isso o comprovante e obrigatorio, e a unica prova dentro do
 * sistema de que o dinheiro saiu.
 *
 * Fora do prazo de 7 dias a rota devolve 409 com `requiresConfirmation`: em vez
 * de bloquear, a tela mostra ha quantos dias foi o pagamento e exige a
 * confirmacao explicita. Bloquear nao desfaria o estorno que ja aconteceu no
 * banco — so deixaria o sistema pagando comissao sobre dinheiro devolvido.
 */
export function ResellerRefundDialog({
  tenantId,
  paymentId,
  amount,
  onDone,
}: {
  tenantId: string
  paymentId: string
  amount: number
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [foraDoPrazo, setForaDoPrazo] = useState<string | null>(null)

  function fechar() {
    setOpen(false)
    setError(null)
    setForaDoPrazo(null)
    setMotivo("")
    setFile(null)
  }

  async function enviar(confirmando: boolean) {
    if (!file) {
      setError("Anexe o comprovante do estorno.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("motivo", motivo)
      fd.append("file", file)
      if (confirmando) fd.append("confirmaForaDoPrazo", "true")

      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/payments/${paymentId}/estornar`,
        { method: "POST", body: fd },
      )
      const body = await res.json()
      if (!res.ok) {
        if (body.requiresConfirmation) {
          setForaDoPrazo(body.error as string)
          return
        }
        setError(body.error ?? "Não foi possível registrar o estorno.")
        return
      }
      onDone?.()
      fechar()
    } catch {
      setError("Erro de rede ao registrar o estorno.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Registrar estorno"
        className="rounded p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-700"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>

      <AlertDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : fechar())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar estorno</AlertDialogTitle>
            <AlertDialogDescription>
              O dinheiro voltou para a unidade. A mensalidade de{" "}
              {amount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}{" "}
              deixa de contar como receita e <strong>sai da comissão de
              indicação</strong>. Se a comissão do mês já tiver sido apurada, os
              saques do indicador ficam bloqueados até o financeiro resolver.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Motivo do estorno
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: cancelamento pedido em 3 dias, devolução por PIX"
                className={INPUT}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Comprovante do estorno (obrigatório)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
              <span className="text-[11px] font-normal text-gray-500">
                PNG, JPG, WEBP ou PDF, até 8MB. É a prova de que o dinheiro saiu.
              </span>
            </label>

            {foraDoPrazo && (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">{foraDoPrazo}</p>
                <p className="mt-1">
                  O registro é permitido mesmo assim — o estorno já aconteceu no
                  banco e o sistema precisa refleti-lo. A operação vai para a
                  auditoria e o SUPER_ADMIN é avisado.
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={fechar} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={() => enviar(Boolean(foraDoPrazo))}
              disabled={saving || motivo.trim().length < 3 || !file}
            >
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {foraDoPrazo ? "Estornar mesmo assim" : "Registrar estorno"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
