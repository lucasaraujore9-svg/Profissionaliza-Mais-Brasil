"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  ExternalLink,
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
import { FinanceiroNotesDialog } from "./financeiro-notes-dialog"

interface TenantPaymentRow {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  amount: number
  billingType: string | null
  status: string
  dueDate: string
  paidAt: string | null
  invoiceUrl: string | null
  asaasPaymentId: string
  notes: string | null
  markedPaidAt: string | null
  markedPaidBy: { id: string; name: string } | null
  origin: "MANUAL" | "ASAAS"
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pendentes", label: "Pendentes" },
  { value: "vencidos", label: "Vencidos" },
  { value: "recebidos", label: "Recebidos" },
  { value: "marcados", label: "Marcados manualmente" },
]

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-emerald-100 text-emerald-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  REFUNDED: "bg-gray-200 text-gray-600",
}
const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "pago",
  CONFIRMED: "confirmado",
  PENDING: "pendente",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
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

interface FinanceiroTenantPaymentsProps {
  canMarkPaid: boolean
}

export function FinanceiroTenantPayments({
  canMarkPaid,
}: FinanceiroTenantPaymentsProps) {
  const [rows, setRows] = useState<TenantPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState("all")
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<TenantPaymentRow | null>(null)
  const [actionRow, setActionRow] = useState<TenantPaymentRow | null>(null)

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
        `/api/admin/financeiro/tenant-payments?${params.toString()}`,
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar mensalidades")
        return
      }
      setRows(data.data ?? [])
    } catch {
      setError("Erro de rede ao carregar mensalidades")
    } finally {
      setLoading(false)
    }
  }, [status, search, from, to])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    let pending = 0
    let received = 0
    let overdue = 0
    for (const r of rows) {
      const s = r.status.toUpperCase()
      if (s === "RECEIVED" || s === "CONFIRMED") received += r.amount
      else if (s === "OVERDUE") overdue += r.amount
      else if (s === "PENDING") pending += r.amount
    }
    return { pending, received, overdue }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Pendentes
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-amber-900">
            {formatMoney(totals.pending)}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            Vencidos
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-rose-900">
            {formatMoney(totals.overdue)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Recebidos (filtro atual)
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-900">
            {formatMoney(totals.received)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="tp-search">Buscar revendedor</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tp-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou slug"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tp-status">Status</Label>
            <select
              id="tp-status"
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
            <Label htmlFor="tp-from">De</Label>
            <Input
              id="tp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tp-to">Até</Label>
            <Input
              id="tp-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={load}
              disabled={loading}
              className="w-full lg:w-auto"
            >
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </Button>
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
            Mensalidades a receber
          </h3>
          <p className="mt-0.5 text-xs text-gray-600">
            {rows.length} pagamento{rows.length === 1 ? "" : "s"} no filtro
            atual.
          </p>
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center px-6 py-10 text-sm text-gray-500">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-gray-500">
            Nenhuma mensalidade encontrada com os filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3 font-medium">Revendedor</th>
                  <th className="px-6 py-3 font-medium">Valor</th>
                  <th className="px-6 py-3 font-medium">Vencimento</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Origem</th>
                  <th className="px-6 py-3 font-medium">Última obs.</th>
                  <th className="px-6 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusKey = r.status.toUpperCase()
                  const isPaid =
                    statusKey === "RECEIVED" || statusKey === "CONFIRMED"
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="px-6 py-3 font-medium text-[var(--color-pmb-green-900)]">
                        <Link
                          href={`/admin/revendedores/${r.tenantId}`}
                          className="hover:text-[var(--color-pmb-green)]"
                        >
                          {r.tenantName}
                        </Link>
                        <div className="text-[11px] font-normal text-gray-500">
                          {r.tenantSlug}
                        </div>
                      </td>
                      <td className="px-6 py-3 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                        {formatMoney(r.amount)}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">
                        {formatDate(r.dueDate)}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            STATUS_STYLES[statusKey] ??
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {STATUS_LABEL[statusKey] ?? r.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            r.origin === "MANUAL"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.origin === "MANUAL" ? "Manual" : "Asaas"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {notePreview(r.notes) || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-1">
                          {!isPaid && canMarkPaid && (
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
          target="tenant-payment"
          itemId={actionRow.id}
          itemLabel={actionRow.tenantName}
          itemAmount={actionRow.amount}
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
          target="tenant-payment"
          itemId={actionRow.id}
          itemLabel={`${actionRow.tenantName} — ${formatMoney(actionRow.amount)}`}
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
        <SheetContent className="w-full sm:max-w-md">
          {detailRow && (
            <>
              <SheetHeader>
                <SheetTitle>{detailRow.tenantName}</SheetTitle>
                <SheetDescription>
                  Mensalidade {detailRow.asaasPaymentId}
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
                      Vencimento
                    </div>
                    <div className="mt-0.5 font-mono">
                      {formatDate(detailRow.dueDate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </div>
                    <div className="mt-0.5">
                      {STATUS_LABEL[detailRow.status.toUpperCase()] ??
                        detailRow.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Cobrança
                    </div>
                    <div className="mt-0.5">{detailRow.billingType ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Pago em
                    </div>
                    <div className="mt-0.5">{formatDate(detailRow.paidAt)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Marcado manual em
                    </div>
                    <div className="mt-0.5">
                      {formatDateTime(detailRow.markedPaidAt)}
                    </div>
                  </div>
                </div>

                {detailRow.markedPaidBy && (
                  <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Marcado como pago por{" "}
                    <strong>{detailRow.markedPaidBy.name}</strong>
                  </div>
                )}

                {detailRow.invoiceUrl && (
                  <a
                    href={detailRow.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    Ver fatura no Asaas
                  </a>
                )}

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
