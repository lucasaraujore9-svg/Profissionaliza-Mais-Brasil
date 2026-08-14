import Link from "next/link"
import { ChevronRight, Share2, Store } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import {
  situacaoCobranca,
  type ChargeUrgency,
} from "@/lib/tenant-billing/types"
import { ResellerStatusBadge } from "./reseller-status"

export type ResellerStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "CANCELLED"

/**
 * Próxima mensalidade da unidade para a PMB. É a cobrança VENCIDA mais antiga
 * quando há atraso, senão a próxima a vencer — a mesma que o painel da unidade
 * mostra, para as duas telas não discordarem sobre quem está devendo.
 */
export interface ResellerNextDue {
  /** ISO do vencimento (data civil gravada como meia-noite UTC). */
  dueDate: string
  amount: number
  daysUntilDue: number
  urgency: ChargeUrgency
}

export interface ResellerRow {
  id: string
  name: string
  slug: string
  email: string | null
  /** Nome do admin/dono da revenda (User.tenantId @unique). */
  ownerName?: string | null
  /** Nome da revenda que indicou esta (indicacao 1-nivel), se houver. */
  referrerName?: string | null
  mrr: number
  students: number
  status: ResellerStatus
  createdAt: string
  accountManagerId?: string | null
  accountManagerName?: string | null
  nextDue?: ResellerNextDue | null
  overdueCount?: number
}

interface ResellerTableProps {
  rows: ResellerRow[]
  showManager?: boolean
  onAssign?: (tenantId: string) => void
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * `dueDate` é uma DATA civil gravada como meia-noite UTC. Formatar no fuso do
 * navegador jogaria o vencimento um dia para trás no Brasil (21h do dia
 * anterior) — daí o `timeZone: "UTC"`.
 */
function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

const URGENCY_TEXT: Record<ChargeUrgency, string> = {
  overdue: "text-red-600 font-semibold",
  "due-today": "text-amber-600 font-semibold",
  "due-soon": "text-amber-600",
  scheduled: "text-gray-500",
}

function NextDueCell({ nextDue }: { nextDue?: ResellerNextDue | null }) {
  if (!nextDue) {
    return <span className="text-xs italic text-gray-400">sem cobrança</span>
  }
  return (
    <>
      <p className="font-mono text-sm text-[var(--color-pmb-green-900)]">
        {formatDueDate(nextDue.dueDate)}
      </p>
      <p className={`mt-0.5 text-[11px] ${URGENCY_TEXT[nextDue.urgency]}`}>
        {situacaoCobranca(nextDue.daysUntilDue)}
      </p>
    </>
  )
}

export function ResellerTable({ rows, showManager = false, onAssign }: ResellerTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Nenhum revendedor encontrado"
        description="Ajuste os filtros ou cadastre uma nova revenda."
      />
    )
  }

  return (
    <>
      {/* Tabela — md+ */}
      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 text-right font-medium">MRR</th>
              <th className="px-6 py-3 font-medium">Vencimento</th>
              <th className="px-6 py-3 text-right font-medium">Alunos</th>
              <th className="px-6 py-3 font-medium">Status</th>
              {showManager && <th className="px-6 py-3 font-medium">Gerente</th>}
              <th className="px-6 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="group border-b border-gray-100 last:border-b-0 hover:bg-[var(--color-pmb-lime-50)]"
              >
                <td className="px-6 py-3">
                  <Link href={`/admin/revendedores/${r.id}`} className="block">
                    <p className="font-semibold text-[var(--color-pmb-green-900)]">{r.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{r.email ?? r.slug}</p>
                    {r.referrerName && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                        <Share2 className="h-2.5 w-2.5" />
                        Indicada por {r.referrerName}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-6 py-3 text-right font-mono font-semibold text-[var(--color-pmb-green-900)]">
                  {formatMoney(r.mrr)}
                </td>
                <td className="whitespace-nowrap px-6 py-3">
                  <NextDueCell nextDue={r.nextDue} />
                </td>
                <td className="px-6 py-3 text-right font-mono text-gray-700">
                  {r.students.toLocaleString("pt-BR")}
                </td>
                <td className="px-6 py-3">
                  <ResellerStatusBadge status={r.status} />
                </td>
                {showManager && (
                  <td className="px-6 py-3 text-xs">
                    {r.accountManagerName ? (
                      <span className="text-gray-700">{r.accountManagerName}</span>
                    ) : (
                      <span className="text-gray-400 italic">sem gerente</span>
                    )}
                  </td>
                )}
                <td className="px-6 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {onAssign && (
                      <button
                        type="button"
                        onClick={() => onAssign(r.id)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-100)]"
                      >
                        Atribuir
                      </button>
                    )}
                    <Link
                      href={`/admin/revendedores/${r.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 group-hover:text-[var(--color-pmb-green)]"
                      aria-label="Ver"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile (< md) */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <Link
              href={`/admin/revendedores/${r.id}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--color-pmb-green-900)]">
                  {r.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {r.email ?? r.slug}
                </p>
                {r.referrerName && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                    <Share2 className="h-2.5 w-2.5" />
                    Indicada por {r.referrerName}
                  </span>
                )}
              </div>
              <ResellerStatusBadge status={r.status} />
            </Link>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
              <span>
                MRR{" "}
                <span className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
                  {formatMoney(r.mrr)}
                </span>
              </span>
              <span>
                Alunos{" "}
                <span className="font-mono text-gray-700">
                  {r.students.toLocaleString("pt-BR")}
                </span>
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
              <span>Vencimento</span>
              {/* `div`, não `span`: NextDueCell renderiza parágrafos. */}
              <div className="text-right">
                <NextDueCell nextDue={r.nextDue} />
              </div>
            </div>
            {showManager && (
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
                <span className="text-gray-500">
                  {r.accountManagerName ?? "sem gerente"}
                </span>
                {onAssign && (
                  <button
                    type="button"
                    onClick={() => onAssign(r.id)}
                    className="rounded-md px-2 py-1 font-medium text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-100)]"
                  >
                    Atribuir
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
