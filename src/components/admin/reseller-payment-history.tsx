"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Trash2, Pencil, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ResellerCard } from "./reseller-card"
import { ResellerStatusBadge } from "./reseller-status"
import {
  CortesiaReasonDialog,
  type CortesiaPrompt,
  type CortesiaRetryResult,
} from "./cortesia-reason-dialog"

export interface ResellerPayment {
  id: string
  asaasPaymentId: string
  amount: number
  billingType: string | null
  status: string
  dueDate: string
  paidAt: string | null
  /** Quando o CLIENTE pagou; no cartao o credito (`paidAt`) sai ~32 dias depois. */
  clientPaidAt: string | null
  invoiceUrl: string | null
  bankSlipUrl: string | null
}

interface ResellerPaymentHistoryProps {
  tenantId: string
  payments: ResellerPayment[]
  onRefresh?: () => void
}

const METHOD_LABEL: Record<string, string> = {
  PIX:          "PIX",
  BOLETO:       "Boleto",
  CREDIT_CARD:  "Cartão",
  UNDEFINED:    "—",
}

const INPUT_CLS =
  "rounded border border-gray-300 px-2 py-1 text-xs focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}

function toYmd(iso: string): string {
  return iso.slice(0, 10)
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface EditState {
  paymentId: string
  dueDate: string
  value: string
}

export function ResellerPaymentHistory({
  tenantId,
  payments,
  onRefresh,
}: ResellerPaymentHistoryProps) {
  const [cancelling, setCancelling]   = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [editing, setEditing]         = useState<EditState | null>(null)
  const [saving, setSaving]           = useState(false)
  const [cortesia, setCortesia]       = useState<CortesiaPrompt | null>(null)
  const [saveError, setSaveError]     = useState<string | null>(null)
  // Cobranças aguardando confirmação do cancelamento (webhook PAYMENT_DELETED).
  // Enquanto o id estiver aqui, a linha mostra "Apagando cobrança…".
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // Confirma o cancelamento: quando a cobrança some da lista (virou DELETED e
  // foi excluída do GET) ou o servidor já a marcou DELETED, tira de "apagando".
  useEffect(() => {
    setDeletingIds((prev) => {
      const present = new Set(payments.map((p) => p.asaasPaymentId))
      const serverDeleting = payments
        .filter((p) => p.status.toUpperCase() === "DELETING")
        .map((p) => p.asaasPaymentId)
      const next = new Set<string>()
      // Otimistas que ainda aparecem na lista = cancelamento não confirmado.
      // Some da lista (virou DELETED, excluído do GET) = confirmado → cai fora.
      for (const id of prev) if (present.has(id)) next.add(id)
      // DELETING vindos do servidor (ex.: outro admin cancelou) também entram.
      for (const id of serverDeleting) next.add(id)
      const unchanged =
        next.size === prev.size && [...next].every((id) => prev.has(id))
      return unchanged ? prev : next
    })
  }, [payments])

  // Enquanto houver cobrança "apagando", repesca o detalhe até confirmar.
  useEffect(() => {
    if (deletingIds.size === 0 || !onRefresh) return
    let attempts = 0
    const MAX = 12 // ~36s
    const timer = setInterval(() => {
      attempts += 1
      onRefresh()
      if (attempts >= MAX) {
        clearInterval(timer)
        setDeletingIds(new Set()) // desiste de aguardar; mostra estado do servidor
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [deletingIds, onRefresh])

  async function handleCancel(paymentId: string) {
    setCancelling(paymentId)
    setCancelError(null)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/payments/${paymentId}`,
        { method: "DELETE" },
      )
      const body = await res.json()
      if (!res.ok) {
        setCancelError(body.error ?? "Falha ao cancelar cobrança")
        return
      }
      // Sucesso do comando: entra em "Apagando cobrança…" até o webhook
      // PAYMENT_DELETED confirmar (a reconciliação do GET é o fallback).
      setDeletingIds((prev) => new Set(prev).add(paymentId))
      setCancelTarget(null)
      onRefresh?.()
    } catch {
      setCancelError("Erro de rede ao cancelar cobrança")
    } finally {
      setCancelling(null)
    }
  }

  function startEdit(p: ResellerPayment) {
    setSaveError(null)
    setEditing({
      paymentId: p.asaasPaymentId,
      dueDate: toYmd(p.dueDate),
      value: String(p.amount),
    })
  }

  function cancelEdit() {
    setEditing(null)
    setSaveError(null)
  }

  /** Devolve o resultado para o diálogo de cortesia — o erro é exibido DENTRO dele. */
  async function saveEdit(reason?: string): Promise<CortesiaRetryResult> {
    if (!editing) return { ok: false }
    setSaving(true)
    setSaveError(null)
    try {
      const body: { dueDate?: string; value?: number; reason?: string } = {}
      if (editing.dueDate) body.dueDate = editing.dueDate
      const numVal = Number(editing.value)
      if (Number.isFinite(numVal) && numVal > 0) body.value = numVal
      if (reason) body.reason = reason

      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/payments/${editing.paymentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) {
        // Cortesia excepcional: adiar cobrança de unidade que nunca pagou.
        if (res.status === 403 && json.requiresReason) {
          setCortesia({ message: json.error, retry: (r) => saveEdit(r) })
          return { ok: false }
        }
        const msg = json.error ?? "Falha ao salvar"
        setSaveError(msg)
        return { ok: false, error: msg }
      }
      setEditing(null)
      onRefresh?.()
      return { ok: true }
    } catch {
      const msg = "Erro de rede ao salvar"
      setSaveError(msg)
      return { ok: false, error: msg }
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResellerCard
      flush
      title="Histórico de pagamentos"
      description="Faturas da assinatura."
    >
      {(cancelError || saveError) && (
        <div className="mx-6 mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {cancelError ?? saveError}
        </div>
      )}

      {payments.length === 0 ? (
        <div className="px-6 py-10 text-center text-xs text-gray-500">
          Nenhuma fatura registrada ainda.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Vencimento</th>
                <th className="px-6 py-3 font-medium">Pago em</th>
                <th className="px-6 py-3 font-medium">Valor</th>
                <th className="px-6 py-3 font-medium">Método</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Link</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const statusKey    = p.status.toUpperCase()
                const methodKey    = (p.billingType ?? "UNDEFINED").toUpperCase()
                const isDeleting   = deletingIds.has(p.asaasPaymentId) || statusKey === "DELETING"
                const isPending    = (statusKey === "PENDING" || statusKey === "OVERDUE") && !isDeleting
                const isEditing    = editing?.paymentId === p.asaasPaymentId
                const isCancelling = cancelling === p.asaasPaymentId
                const displayStatus = isDeleting ? "DELETING" : p.status
                const paymentLink  = isPending
                  ? `/cobranca/${p.asaasPaymentId}`
                  : (p.invoiceUrl ?? p.bankSlipUrl)

                return (
                  <tr key={p.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Vencimento */}
                    <td className="px-6 py-3">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editing.dueDate}
                          onChange={(e) =>
                            setEditing({ ...editing, dueDate: e.target.value })
                          }
                          className={`w-36 ${INPUT_CLS}`}
                        />
                      ) : (
                        <span className="font-mono text-xs text-gray-700">
                          {formatDate(p.dueDate)}
                        </span>
                      )}
                    </td>

                    {/* Pago em — a data do CLIENTE, nao a do credito. No cartao
                        o Asaas credita ~32 dias depois, e e a data do cliente
                        que define a competencia da comissao de indicacao. */}
                    <td className="px-6 py-3">
                      {p.clientPaidAt ?? p.paidAt ? (
                        <span className="font-mono text-xs text-gray-700">
                          {formatDate((p.clientPaidAt ?? p.paidAt) as string)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Valor */}
                    <td className="px-6 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          step="0.01"
                          value={editing.value}
                          onChange={(e) =>
                            setEditing({ ...editing, value: e.target.value })
                          }
                          className={`w-24 font-mono ${INPUT_CLS}`}
                        />
                      ) : (
                        <span className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
                          {formatMoney(p.amount)}
                        </span>
                      )}
                    </td>

                    {/* Método */}
                    <td className="px-6 py-3 text-xs text-gray-600">
                      {METHOD_LABEL[methodKey] ?? methodKey}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <ResellerStatusBadge status={displayStatus} />
                        {isDeleting && (
                          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                        )}
                      </span>
                    </td>

                    {/* Link */}
                    <td className="px-6 py-3">
                      {paymentLink && !isEditing ? (
                        <a
                          href={paymentLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                            isPending
                              ? "bg-[var(--color-pmb-gold-50)] text-[var(--color-pmb-gold-600)] hover:bg-[var(--color-pmb-gold)]/15"
                              : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {isPending ? "Enviar link" : "Ver fatura"}
                        </a>
                      ) : (
                        !isEditing && <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-6 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            onClick={() => saveEdit()}
                            disabled={saving}
                            title="Salvar"
                            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
                          >
                            <Check className="h-3 w-3" />
                            {saving ? "..." : "Salvar"}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={saving}
                            title="Cancelar"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {isPending && !isEditing && (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => startEdit(p)}
                              title="Editar vencimento/valor"
                              className="text-gray-500"
                            >
                              <Pencil className="h-3 w-3" />
                              Editar
                            </Button>
                          )}
                          {isPending && (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => setCancelTarget(p.asaasPaymentId)}
                              disabled={isCancelling}
                              title="Cancelar cobrança"
                              className="text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              {isCancelling ? "..." : "Cancelar"}
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmacao: cancelar cobranca */}
      <AlertDialog
        open={cancelTarget != null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta cobrança?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling != null}
            >
              Voltar
            </Button>
            <Button
              className="border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => cancelTarget && handleCancel(cancelTarget)}
              disabled={cancelling != null}
            >
              {cancelling != null ? "Cancelando..." : "Cancelar cobrança"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CortesiaReasonDialog prompt={cortesia} onClose={() => setCortesia(null)} />
    </ResellerCard>
  )
}
