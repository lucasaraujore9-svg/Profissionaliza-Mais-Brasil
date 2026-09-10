"use client"

import { useState } from "react"
import { Loader2, BadgeCheck } from "lucide-react"
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

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * BAIXA MANUAL DE UMA FATURA existente (vencida ou a vencer).
 *
 * Diferente do lancamento de meses futuros: aqui a cobranca existe, e ao dar
 * baixa ela e CANCELADA no Asaas — mantida viva, seria cobrada de novo, venceria
 * e acabaria suspendendo uma unidade que ja pagou.
 */
export function ResellerSettleInvoiceDialog({
  tenantId,
  paymentId,
  amount,
  dueDate,
  onDone,
}: {
  tenantId: string
  paymentId: string
  amount: number
  dueDate: string
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [paidAt, setPaidAt] = useState(hoje())
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function fechar() {
    setOpen(false)
    setError(null)
    setAviso(null)
    setNote("")
  }

  async function salvar() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/payments/${paymentId}/baixa-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt, note: note.trim() || null }),
        },
      )
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Não foi possível dar baixa.")
        return
      }
      onDone?.()
      if (body.data?.asaasCancelFailed) {
        // A baixa valeu; o que falhou foi apagar a cobranca la. Nao escondemos:
        // ela continua cobravel ate alguem cancelar a mao.
        setAviso(
          `Baixa registrada, mas a cobrança NÃO pôde ser cancelada no Asaas (${body.data.asaasCancelFailed}). Cancele-a manualmente para a unidade não pagar duas vezes.`,
        )
        return
      }
      fechar()
    } catch {
      setError("Erro de rede ao dar baixa.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Rotulo ESCRITO, nao so o icone: quem opera o financeiro precisa saber
          o que o botao faz sem passar o mouse para ler o `title`. */}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Recebido fora da plataforma: quita a fatura e cancela a cobrança no Asaas"
        className="text-[var(--color-pmb-green-900)] hover:bg-[var(--color-pmb-lime-50)]"
      >
        <BadgeCheck className="h-3 w-3" />
        Baixa manual
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : fechar())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar baixa nesta fatura</AlertDialogTitle>
            <AlertDialogDescription>
              Fatura de{" "}
              {amount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}{" "}
              com vencimento em {new Date(dueDate).toLocaleDateString("pt-BR")}.
              Use quando o pagamento veio por fora (PIX direto, transferência,
              dinheiro). <strong>A cobrança é cancelada no Asaas</strong> para a
              unidade não pagar de novo, e o valor passa a contar na comissão de
              indicação.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {aviso ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {aviso}
            </p>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Pago em
                <input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className={INPUT}
                />
                <span className="text-[11px] font-normal text-gray-500">
                  Pagamento em dia ou adiantado conta no mês da fatura; atrasado
                  conta no mês em que foi pago.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Observação (opcional)
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex.: PIX recebido na conta da PMB"
                  className={INPUT}
                />
              </label>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {aviso ? (
              <Button onClick={fechar}>Entendi</Button>
            ) : (
              <>
                <Button variant="outline" onClick={fechar} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Dar baixa
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
