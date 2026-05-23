"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  StickyNote,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { FinanceiroMarkPaidDialog } from "./financeiro-mark-paid-dialog"
import {
  FinanceiroFailPayoutDialog,
  FinanceiroNotesDialog,
} from "./financeiro-notes-dialog"

interface ReferralCommissionRow {
  id: string
  amount: number
  baseAmount: number
  percent: number
  status: string
  referredId: string
  referredName: string
  referredSlug: string
}

interface ReferralPayoutRow {
  id: string
  referrerId: string
  referrerName: string
  referrerSlug: string
  amount: number
  method: "ASAAS_PIX" | "DESCONTO_MENSALIDADE" | "MANUAL"
  status: "REQUESTED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED"
  pixKey: string | null
  pixKeyType: string | null
  asaasTransferId: string | null
  failureReason: string | null
  notes: string | null
  requestedAt: string
  processedAt: string | null
  paidAt: string | null
  commissionCount: number
  commissions: ReferralCommissionRow[]
  markedPaidBy: { id: string; name: string } | null
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pendentes", label: "Pendentes (Requested/Processing)" },
  { value: "REQUESTED", label: "Solicitados" },
  { value: "PROCESSING", label: "Em processamento" },
  { value: "PAID", label: "Pagos" },
  { value: "FAILED", label: "Recusados" },
  { value: "CANCELLED", label: "Cancelados" },
]

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-gray-200 text-gray-600",
}
const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "solicitado",
  PROCESSING: "processando",
  PAID: "pago",
  FAILED: "recusado",
  CANCELLED: "cancelado",
}
const METHOD_LABEL: Record<string, string> = {
  ASAAS_PIX: "PIX (Asaas)",
  DESCONTO_MENSALIDADE: "Desconto",
  MANUAL: "Manual",
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v)
}
function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}
function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("pt-BR")
  } catch {
    return iso
  }
}
function notePreview(notes: string | null): string {
  if (!notes) return ""
  const lines = notes.split("\n").filter((l) => l.trim().length > 0)
  const last = lines[lines.length - 1] ?? ""
  return last.length > 60 ? last.slice(0, 57) + "..." : last
}

interface FinanceiroReferralPayoutsProps {
  canMarkPaid: boolean
}

export function FinanceiroReferralPayouts({
  canMarkPaid,
}: FinanceiroReferralPayoutsProps) {
  const [rows, setRows] = useState<ReferralPayoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState("all")
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [failOpen, setFailOpen] = useState(false)
  const [actionRow, setActionRow] = useState<ReferralPayoutRow | null>(null)
  const [detailRow, setDetailRow] = useState<ReferralPayoutRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== "all") params.set("status", status)
      if (search.trim()) params.set("search", search.trim())
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const res = await fetch(
        `/api/admin/financeiro/referral-payouts?${params.toString()}`,
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar saques de indicação")
        return
      }
      setRows(data.data ?? [])
    } catch {
      setError("Erro de rede ao carregar saques")
    } finally {
      setLoading(false)
    }
  }, [status, search, from, to])

  useEffect(() => {
    load()
  }, [load])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams()
    if (status !== "all") params.set("status", status)
    if (search.trim()) params.set("search", search.trim())
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    const qs = params.toString()
    return `/api/admin/referrals/payouts/export${qs ? `?${qs}` : ""}`
  }, [status, search, from, to])

  const totals = useMemo(() => {
    let pending = 0
    let paid = 0
    for (const r of rows) {
      if (r.status === "REQUESTED" || r.status === "PROCESSING")
        pending += r.amount
      else if (r.status === "PAID") paid += r.amount
    }
    return { pending, paid }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            A pagar
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-amber-900">
            {formatMoney(totals.pending)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Pagos (filtro atual)
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-900">
            {formatMoney(totals.paid)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            Total no filtro
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-gray-800">
            {rows.length}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="rp-search">Buscar indicador</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="rp-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou slug do revendedor"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rp-status">Status</Label>
            <select
              id="rp-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rp-from">De</Label>
            <Input
              id="rp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rp-to">Até</Label>
            <Input
              id="rp-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={load}
              disabled={loading}
              className="w-full lg:w-auto"
            >
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </Button>
            <a
              href={exportHref}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground lg:w-auto"
            >
              <Download className="size-3.5" />
              Exportar CSV
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Comissões a pagar
          </h3>
          <p className="mt-0.5 text-xs text-gray-600">
            {rows.length} saque{rows.length === 1 ? "" : "s"} de indicação no
            filtro atual.
          </p>
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center px-6 py-10 text-sm text-gray-500">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-gray-500">
            Nenhum saque encontrado com os filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3 font-medium">Indicador</th>
                  <th className="px-6 py-3 font-medium">Valor</th>
                  <th className="px-6 py-3 font-medium">Método / PIX</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Solicitado</th>
                  <th className="px-6 py-3 font-medium">Marcado por</th>
                  <th className="px-6 py-3 font-medium">Última obs.</th>
                  <th className="px-6 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen =
                    r.status === "REQUESTED" || r.status === "PROCESSING"
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="px-6 py-3 font-medium text-[var(--color-pmb-green-900)]">
                        <Link
                          href={`/admin/revendedores/${r.referrerId}`}
                          className="hover:text-[var(--color-pmb-green)]"
                        >
                          {r.referrerName}
                        </Link>
                        <div className="text-[11px] font-normal text-gray-500">
                          {r.referrerSlug}
                        </div>
                      </td>
                      <td className="px-6 py-3 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                        {formatMoney(r.amount)}
                      </td>
                      <td className="px-6 py-3 text-xs">
                        <div className="font-semibold">
                          {METHOD_LABEL[r.method] ?? r.method}
                        </div>
                        {r.pixKey && (
                          <div className="font-mono text-[11px] text-gray-500">
                            {r.pixKeyType}: {r.pixKey}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            STATUS_STYLES[r.status] ??
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">
                        {formatDate(r.requestedAt)}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {r.markedPaidBy?.name ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {notePreview(r.notes) || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          {isOpen && canMarkPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActionRow(r)
                                setMarkPaidOpen(true)
                              }}
                            >
                              <CheckCircle2 className="size-3.5" />
                              Marcar pago
                            </Button>
                          )}
                          {isOpen && canMarkPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActionRow(r)
                                setFailOpen(true)
                              }}
                            >
                              <Ban className="size-3.5" />
                              Recusar
                            </Button>
                          )}
                          {canMarkPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActionRow(r)
                                setNoteOpen(true)
                              }}
                            >
                              <StickyNote className="size-3.5" />
                              Obs.
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailRow(r)}
                          >
                            <FileText className="size-3.5" />
                            Detalhes
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionRow && (
        <FinanceiroMarkPaidDialog
          open={markPaidOpen}
          onOpenChange={(o) => {
            setMarkPaidOpen(o)
            if (!o) setActionRow(null)
          }}
          target="referral-payout"
          itemId={actionRow.id}
          itemLabel={actionRow.referrerName}
          itemAmount={actionRow.amount}
          onDone={load}
        />
      )}
      {actionRow && (
        <FinanceiroFailPayoutDialog
          open={failOpen}
          onOpenChange={(o) => {
            setFailOpen(o)
            if (!o) setActionRow(null)
          }}
          payoutId={actionRow.id}
          onDone={load}
        />
      )}
      {actionRow && (
        <FinanceiroNotesDialog
          open={noteOpen}
          onOpenChange={(o) => {
            setNoteOpen(o)
            if (!o) setActionRow(null)
          }}
          target="referral-payout"
          itemId={actionRow.id}
          itemLabel={`${actionRow.referrerName} — ${formatMoney(actionRow.amount)}`}
          existingNotes={actionRow.notes}
          onDone={load}
        />
      )}

      <Sheet
        open={detailRow !== null}
        onOpenChange={(o) => {
          if (!o) setDetailRow(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-lg">
          {detailRow && (
            <>
              <SheetHeader>
                <SheetTitle>{detailRow.referrerName}</SheetTitle>
                <SheetDescription>
                  Saque de indicação — {METHOD_LABEL[detailRow.method]}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Valor
                    </div>
                    <div className="mt-0.5 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                      {formatMoney(detailRow.amount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </div>
                    <div className="mt-0.5">
                      {STATUS_LABEL[detailRow.status] ?? detailRow.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Solicitado em
                    </div>
                    <div className="mt-0.5">
                      {formatDateTime(detailRow.requestedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Pago em
                    </div>
                    <div className="mt-0.5">
                      {formatDateTime(detailRow.paidAt)}
                    </div>
                  </div>
                  {detailRow.pixKey && (
                    <div className="col-span-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Chave PIX ({detailRow.pixKeyType})
                      </div>
                      <div className="mt-0.5 font-mono text-xs">
                        {detailRow.pixKey}
                      </div>
                    </div>
                  )}
                  {detailRow.asaasTransferId && (
                    <div className="col-span-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Transfer Asaas
                      </div>
                      <div className="mt-0.5 font-mono text-xs">
                        {detailRow.asaasTransferId}
                      </div>
                    </div>
                  )}
                  {detailRow.failureReason && (
                    <div className="col-span-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <strong>Motivo da recusa:</strong>{" "}
                      {detailRow.failureReason}
                    </div>
                  )}
                </div>

                {detailRow.markedPaidBy && (
                  <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Marcado como pago por{" "}
                    <strong>{detailRow.markedPaidBy.name}</strong>
                  </div>
                )}

                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Comissões vinculadas
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {detailRow.commissionCount}{" "}
                      no total
                    </div>
                  </div>
                  {detailRow.commissions.length === 0 ? (
                    <div className="mt-1.5 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                      Nenhuma comissão vinculada.
                    </div>
                  ) : (
                    <div className="mt-1.5 max-h-72 overflow-y-auto rounded-md border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                            <th className="px-3 py-2 font-medium">Indicado</th>
                            <th className="px-3 py-2 font-medium">Base</th>
                            <th className="px-3 py-2 font-medium">%</th>
                            <th className="px-3 py-2 font-medium">Comissão</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailRow.commissions.map((c) => (
                            <tr
                              key={c.id}
                              className="border-b border-gray-100 last:border-b-0"
                            >
                              <td className="px-3 py-1.5">{c.referredName}</td>
                              <td className="px-3 py-1.5 font-mono">
                                {formatMoney(c.baseAmount)}
                              </td>
                              <td className="px-3 py-1.5 font-mono">
                                {c.percent.toFixed(2)}%
                              </td>
                              <td className="px-3 py-1.5 font-mono font-semibold">
                                {formatMoney(c.amount)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                                  {c.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Histórico de observações
                  </div>
                  <div className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700">
                    {detailRow.notes && detailRow.notes.trim().length > 0
                      ? detailRow.notes
                      : "Nenhuma observação registrada."}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
