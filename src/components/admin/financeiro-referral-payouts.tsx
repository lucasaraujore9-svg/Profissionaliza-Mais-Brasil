"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Inbox,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  StickyNote,
  Upload,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { FinanceStatusBadge } from "./finance-status"
import {
  formatDate,
  formatDateTime,
  formatMoney,
  notePreview,
} from "@/lib/admin/finance-format"
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

interface ReferralMonthlyCommissionRow {
  id: string
  period: string
  rateType: "FIXED" | "PERCENT"
  bracketBasis: "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS"
  payoutBase: "ALL_ACTIVE" | "REFERRED_THIS_MONTH" | "PAID_THIS_MONTH"
  bracketCount: number
  rate: number
  unitCount: number
  baseSum: number
  amount: number
  status: string
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
  proofUrl: string | null
  proofUploadedAt: string | null
  commissionCount: number
  commissions: ReferralCommissionRow[]
  monthlyCommissionCount: number
  monthlyCommissions: ReferralMonthlyCommissionRow[]
  markedPaidBy: { id: string; name: string } | null
}

const BASIS_LABEL: Record<string, string> = {
  NEW_REFERRALS_MONTH: "indicações no mês",
  ACTIVE_UNITS: "unidades ativas",
}
const PAYOUT_BASE_LABEL: Record<string, string> = {
  ALL_ACTIVE: "todas ativas",
  REFERRED_THIS_MONTH: "indicadas no mês",
  PAID_THIS_MONTH: "pagantes no mês",
}
function formatPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  return m ? `${m[2]}/${m[1]}` : period
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

const METHOD_LABEL: Record<string, string> = {
  ASAAS_PIX: "PIX (Asaas)",
  DESCONTO_MENSALIDADE: "Desconto",
  MANUAL: "Manual",
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
  const [uploadingProof, setUploadingProof] = useState(false)

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

  const uploadProof = useCallback(
    async (payoutId: string, file: File) => {
      setUploadingProof(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch(
          `/api/admin/financeiro/referral-payouts/${payoutId}/proof`,
          { method: "POST", body: fd },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(body.error ?? "Falha ao enviar comprovante")
          return
        }
        // Atualiza a linha aberta no detalhe e recarrega a lista.
        setDetailRow((prev) =>
          prev && prev.id === payoutId
            ? {
                ...prev,
                proofUrl: body.data?.proofUrl ?? prev.proofUrl,
                proofUploadedAt:
                  body.data?.proofUploadedAt ?? prev.proofUploadedAt,
              }
            : prev,
        )
        await load()
      } catch {
        setError("Erro de rede ao enviar comprovante")
      } finally {
        setUploadingProof(false)
      }
    },
    [load],
  )

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
        <KpiCard tone="gold" label="A pagar" value={formatMoney(totals.pending)} />
        <KpiCard
          tone="green"
          label="Pagos (filtro atual)"
          value={formatMoney(totals.paid)}
        />
        <KpiCard tone="neutral" label="Total no filtro" value={String(rows.length)} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
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
            <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
              <SelectTrigger id="rp-status" className="h-9 w-full lg:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full lg:w-auto",
              )}
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
          <div className="p-4">
            <EmptyState
              icon={Inbox}
              title="Nenhum saque encontrado"
              description="Ajuste os filtros para ver outros saques de indicação."
              className="border-none"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="sticky top-0 z-10">
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
                  const showActions = isOpen && canMarkPaid
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
                        <FinanceStatusBadge status={r.status} />
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
                        <div className="flex items-center justify-end gap-1">
                          {showActions ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setActionRow(r)
                                setMarkPaidOpen(true)
                              }}
                            >
                              <CheckCircle2 className="size-3.5" />
                              Marcar pago
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDetailRow(r)}
                            >
                              <FileText className="size-3.5" />
                              Detalhes
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label="Mais ações"
                                />
                              }
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {showActions && (
                                <DropdownMenuItem
                                  onClick={() => setDetailRow(r)}
                                >
                                  <FileText className="size-3.5" />
                                  Detalhes
                                </DropdownMenuItem>
                              )}
                              {showActions && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => {
                                    setActionRow(r)
                                    setFailOpen(true)
                                  }}
                                >
                                  <Ban className="size-3.5" />
                                  Recusar
                                </DropdownMenuItem>
                              )}
                              {canMarkPaid && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setActionRow(r)
                                    setNoteOpen(true)
                                  }}
                                >
                                  <StickyNote className="size-3.5" />
                                  Observação
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
          existingProofUrl={actionRow.proofUrl}
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
                    <div className="mt-1">
                      <FinanceStatusBadge status={detailRow.status} />
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
                  <div className="rounded-md bg-[var(--color-pmb-cyan-50)] px-3 py-2 text-xs text-[var(--color-pmb-cyan-700)]">
                    Marcado como pago por{" "}
                    <strong>{detailRow.markedPaidBy.name}</strong>
                  </div>
                )}

                {/* Comprovante de pagamento — visível para a revenda. */}
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Comprovante de pagamento
                  </div>
                  {detailRow.proofUrl ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <a
                        href={`/api/admin/financeiro/referral-payouts/${detailRow.id}/proof/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--color-pmb-green-900)] hover:underline"
                      >
                        <FileText className="size-3.5" />
                        Ver comprovante
                      </a>
                      <span className="text-gray-500">
                        enviado em {formatDateTime(detailRow.proofUploadedAt)}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">
                      Nenhum comprovante anexado.
                    </p>
                  )}
                  {canMarkPaid && (
                    <label
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "mt-2 cursor-pointer",
                      )}
                    >
                      {uploadingProof ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      {detailRow.proofUrl
                        ? "Substituir comprovante"
                        : "Anexar comprovante"}
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={uploadingProof}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void uploadProof(detailRow.id, file)
                          e.target.value = ""
                        }}
                      />
                    </label>
                  )}
                </div>

                {(detailRow.commissions.length > 0 ||
                  detailRow.monthlyCommissions.length === 0) && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Comissões por pagamento
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
                                <FinanceStatusBadge status={c.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                )}

                {detailRow.monthlyCommissions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Comissões por faixas (mensal)
                    </div>
                    <div className="mt-1.5 space-y-2">
                      {detailRow.monthlyCommissions.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[var(--color-pmb-green-900)]">
                              {formatPeriod(m.period)}
                            </span>
                            <span className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
                              {formatMoney(m.amount)}
                            </span>
                          </div>
                          {m.rate > 0 ? (
                            <div className="mt-1 text-gray-600">
                              Faixa: {m.bracketCount}{" "}
                              {BASIS_LABEL[m.bracketBasis] ?? m.bracketBasis} →{" "}
                              {m.rateType === "PERCENT"
                                ? `${m.rate.toFixed(2)}%`
                                : formatMoney(m.rate)}{" "}
                              por unidade
                            </div>
                          ) : (
                            <div className="mt-1 text-gray-600">
                              Plano em fases — valores variam por unidade
                            </div>
                          )}
                          <div className="text-gray-600">
                            Base: {m.unitCount} unidade
                            {m.unitCount === 1 ? "" : "s"}
                            {m.rate > 0
                              ? ` (${PAYOUT_BASE_LABEL[m.payoutBase] ?? m.payoutBase})`
                              : ""}
                            {m.rateType === "PERCENT" && m.baseSum > 0
                              ? ` · mensalidades ${formatMoney(m.baseSum)}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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

const KPI_TONE: Record<
  "gold" | "green" | "neutral",
  { card: string; label: string; value: string }
> = {
  gold: {
    card: "border-[var(--color-pmb-gold)]/30 bg-[var(--color-pmb-gold)]/10",
    label: "text-[var(--color-pmb-gold-600)]",
    value: "text-[var(--color-pmb-gold-600)]",
  },
  green: {
    card: "border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-lime-50)]",
    label: "text-[var(--color-pmb-green-700)]",
    value: "text-[var(--color-pmb-green-900)]",
  },
  neutral: {
    card: "border-gray-200 bg-gray-50",
    label: "text-gray-600",
    value: "text-gray-800",
  },
}

function KpiCard({
  tone,
  label,
  value,
}: {
  tone: "gold" | "green" | "neutral"
  label: string
  value: string
}) {
  const t = KPI_TONE[tone]
  return (
    <div className={`rounded-2xl border p-4 ${t.card}`}>
      <p
        className={`text-[10px] font-semibold uppercase tracking-wide ${t.label}`}
      >
        {label}
      </p>
      <p className={`mt-1 font-mono text-xl font-bold ${t.value}`}>{value}</p>
    </div>
  )
}
