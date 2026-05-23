"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type {
  ReferralCommissionStatus,
  ReferralPayoutStatus,
} from "@prisma/client"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface CommissionRow {
  id: string
  status: ReferralCommissionStatus
  baseAmount: number
  percent: number
  amount: number
  availableAt: string
  paidAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  payoutId: string | null
  referrer: { id: string; name: string; slug: string }
  referred: { id: string; name: string; slug: string }
  tenantPayment: {
    id: string
    dueDate: string
    paidAt: string | null
    amount: number
    status: string
  }
  payout: {
    id: string
    status: ReferralPayoutStatus
    paidAt: string | null
  } | null
}

interface ResellerCommissionsTabsProps {
  tenantId: string
  hasReferrer: boolean
  received: CommissionRow[]
  generated: CommissionRow[]
}

const STATUS_OPTS: Array<{ value: ReferralCommissionStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "PENDING", label: "Pendente" },
  { value: "AVAILABLE", label: "Disponivel" },
  { value: "PAID", label: "Pago" },
  { value: "CANCELLED", label: "Cancelada" },
]

const STATUS_LABEL: Record<ReferralCommissionStatus, string> = {
  PENDING: "Pendente",
  AVAILABLE: "Disponivel",
  PAID: "Pago",
  CANCELLED: "Cancelada",
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

function formatMoney(n: number): string {
  return BRL.format(n)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("pt-BR")
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${mm}/${d.getFullYear()}`
}

function statusVariant(
  status: ReferralCommissionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PAID":
      return "default"
    case "AVAILABLE":
      return "default"
    case "PENDING":
      return "secondary"
    case "CANCELLED":
      return "destructive"
    default:
      return "outline"
  }
}

interface SummaryTiles {
  pending: number
  available: number
  paid: number
  cancelled: number
}

function computeSummary(rows: CommissionRow[]): SummaryTiles {
  const acc: SummaryTiles = { pending: 0, available: 0, paid: 0, cancelled: 0 }
  for (const r of rows) {
    if (r.status === "PENDING") acc.pending += r.amount
    else if (r.status === "AVAILABLE") acc.available += r.amount
    else if (r.status === "PAID") acc.paid += r.amount
    else if (r.status === "CANCELLED") acc.cancelled += r.amount
  }
  return acc
}

function applyFilters(
  rows: CommissionRow[],
  status: ReferralCommissionStatus | "ALL",
  from: string,
  to: string,
): CommissionRow[] {
  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null
  return rows.filter((r) => {
    if (status !== "ALL" && r.status !== status) return false
    const created = new Date(r.createdAt).getTime()
    if (fromTs != null && created < fromTs) return false
    if (toTs != null && created > toTs) return false
    return true
  })
}

function SummaryTilesView({ totals }: { totals: SummaryTiles }) {
  const tiles: Array<{ label: string; value: number; tone: string }> = [
    {
      label: "Pendente",
      value: totals.pending,
      tone: "bg-amber-50 text-amber-900 border-amber-200",
    },
    {
      label: "Disponivel",
      value: totals.available,
      tone: "bg-emerald-50 text-emerald-900 border-emerald-200",
    },
    {
      label: "Pago",
      value: totals.paid,
      tone: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)] border-[var(--color-pmb-lime-200,#d6e8c6)]",
    },
    {
      label: "Cancelada",
      value: totals.cancelled,
      tone: "bg-gray-50 text-gray-700 border-gray-200",
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-xl border p-4 ${t.tone}`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {t.label}
          </div>
          <div className="mt-1 text-lg font-semibold">
            {formatMoney(t.value)}
          </div>
        </div>
      ))}
    </div>
  )
}

interface FilterBarProps {
  status: ReferralCommissionStatus | "ALL"
  from: string
  to: string
  onChange: (next: {
    status?: ReferralCommissionStatus | "ALL"
    from?: string
    to?: string
  }) => void
  onClear: () => void
}

function FilterBar({ status, from, to, onChange, onClear }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Status
        </label>
        <Select
          value={status}
          onValueChange={(v) =>
            onChange({ status: v as ReferralCommissionStatus | "ALL" })
          }
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          De (criado em)
        </label>
        <input
          type="date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value })}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Ate
        </label>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange({ to: e.target.value })}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
        />
      </div>
      {(status !== "ALL" || from || to) && (
        <button
          type="button"
          onClick={onClear}
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Limpar
        </button>
      )}
    </div>
  )
}

interface CommissionsTableProps {
  rows: CommissionRow[]
  counterpartyKey: "referrer" | "referred"
  counterpartyLabel: string
}

function CommissionsTable({
  rows,
  counterpartyKey,
  counterpartyLabel,
}: CommissionsTableProps) {
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{counterpartyLabel}</TableHead>
            <TableHead>Competencia</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Comissao</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Libera em</TableHead>
            <TableHead>Payout</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="py-8 text-center text-sm text-gray-500"
              >
                Nenhuma comissao encontrada com os filtros atuais.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((c) => {
              const counterparty = c[counterpartyKey]
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/revendedores/${counterparty.id}`}
                      className="text-[var(--color-pmb-green-900)] hover:underline"
                    >
                      {counterparty.name}
                    </Link>
                    <div className="text-[11px] text-gray-500">
                      /{counterparty.slug}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatMonthYear(c.tenantPayment.dueDate)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(c.baseAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {c.percent.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatMoney(c.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                    {c.status === "CANCELLED" && c.cancelReason && (
                      <div className="mt-1 text-[10px] text-gray-500">
                        {c.cancelReason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(c.availableAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.payout ? (
                      <Link
                        href={`/admin/indicacoes/saques?payout=${c.payout.id}`}
                        className="text-[var(--color-pmb-green-900)] hover:underline"
                      >
                        {c.payout.status}
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

interface TabPanelState {
  status: ReferralCommissionStatus | "ALL"
  from: string
  to: string
}

const INITIAL_STATE: TabPanelState = { status: "ALL", from: "", to: "" }

export function ResellerCommissionsTabs({
  hasReferrer,
  received,
  generated,
}: ResellerCommissionsTabsProps) {
  const [receivedFilters, setReceivedFilters] =
    useState<TabPanelState>(INITIAL_STATE)
  const [generatedFilters, setGeneratedFilters] =
    useState<TabPanelState>(INITIAL_STATE)

  const filteredReceived = useMemo(
    () =>
      applyFilters(
        received,
        receivedFilters.status,
        receivedFilters.from,
        receivedFilters.to,
      ),
    [received, receivedFilters],
  )
  const filteredGenerated = useMemo(
    () =>
      applyFilters(
        generated,
        generatedFilters.status,
        generatedFilters.from,
        generatedFilters.to,
      ),
    [generated, generatedFilters],
  )

  const receivedTotals = useMemo(
    () => computeSummary(filteredReceived),
    [filteredReceived],
  )
  const generatedTotals = useMemo(
    () => computeSummary(filteredGenerated),
    [filteredGenerated],
  )

  return (
    <Tabs defaultValue="received" className="gap-4">
      <TabsList>
        <TabsTrigger value="received">
          Comissoes recebidas ({received.length})
        </TabsTrigger>
        <TabsTrigger value="generated">
          Comissoes geradas ({generated.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="received" className="space-y-4">
        <SummaryTilesView totals={receivedTotals} />
        <FilterBar
          status={receivedFilters.status}
          from={receivedFilters.from}
          to={receivedFilters.to}
          onChange={(next) =>
            setReceivedFilters((s) => ({ ...s, ...next }))
          }
          onClear={() => setReceivedFilters(INITIAL_STATE)}
        />
        <CommissionsTable
          rows={filteredReceived}
          counterpartyKey="referred"
          counterpartyLabel="Indicado"
        />
      </TabsContent>

      <TabsContent value="generated" className="space-y-4">
        {!hasReferrer ? (
          <Card className="p-10 text-center text-sm text-gray-500">
            Esta unidade nao foi indicada por ninguem.
          </Card>
        ) : (
          <>
            <SummaryTilesView totals={generatedTotals} />
            <FilterBar
              status={generatedFilters.status}
              from={generatedFilters.from}
              to={generatedFilters.to}
              onChange={(next) =>
                setGeneratedFilters((s) => ({ ...s, ...next }))
              }
              onClear={() => setGeneratedFilters(INITIAL_STATE)}
            />
            <CommissionsTable
              rows={filteredGenerated}
              counterpartyKey="referrer"
              counterpartyLabel="Indicador"
            />
          </>
        )}
      </TabsContent>
    </Tabs>
  )
}
