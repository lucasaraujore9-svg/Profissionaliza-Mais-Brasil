import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Share2, Store } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import {
  situacaoCobranca,
  type ChargeUrgency,
} from "@/lib/tenant-billing/types"
import {
  RESELLER_SORT_LABELS,
  toggleResellerSort,
  type ResellerSort,
  type ResellerSortKey,
} from "@/lib/admin/resellers/sort"
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
  /** Ordenação em vigor. Sem `onSortChange`, os títulos ficam estáticos. */
  sort?: ResellerSort
  onSortChange?: (sort: ResellerSort) => void
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

interface SortableHeadProps {
  column: ResellerSortKey
  sort?: ResellerSort
  onSortChange?: (sort: ResellerSort) => void
  align?: "left" | "right"
  className?: string
}

/**
 * Título de coluna clicável. Sem `onSortChange` (ou sem `sort`) desenha o
 * rótulo simples — a tabela continua servindo a quem não pluga ordenação.
 */
function SortableHead({
  column,
  sort,
  onSortChange,
  align = "left",
  className = "",
}: SortableHeadProps) {
  const label = RESELLER_SORT_LABELS[column]
  const base = `px-6 py-3 font-medium ${align === "right" ? "text-right" : ""} ${className}`

  if (!sort || !onSortChange) {
    return <th className={base}>{label}</th>
  }

  const active = sort.key === column
  return (
    <th
      className={base}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSortChange(toggleResellerSort(sort, column))}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-[var(--color-pmb-green-900)] ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-[var(--color-pmb-green)]" : ""}`}
        title={`Ordenar por ${label}`}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-gray-300" />
        )}
      </button>
    </th>
  )
}

/**
 * Ordenação no mobile: os cards não têm cabeçalho onde clicar. Um `select`
 * nativo (e não o do design system) porque aqui ele é um controle acessório —
 * e porque o wrapper de `Select` exige plumbing de itens que não paga a pena
 * para sete opções.
 */
function MobileSortControl({
  sort,
  onSortChange,
  columns,
}: {
  sort: ResellerSort
  onSortChange: (sort: ResellerSort) => void
  columns: ResellerSortKey[]
}) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm md:hidden">
      <label htmlFor="reseller-sort" className="text-xs font-medium text-gray-500">
        Ordenar por
      </label>
      <select
        id="reseller-sort"
        value={sort.key}
        onChange={(e) =>
          onSortChange({
            key: e.target.value as ResellerSortKey,
            dir: sort.dir,
          })
        }
        className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-[var(--color-pmb-green-900)]"
      >
        {columns.map((key) => (
          <option key={key} value={key}>
            {RESELLER_SORT_LABELS[key]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onSortChange({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-100)]"
        aria-label={sort.dir === "asc" ? "Ordem crescente" : "Ordem decrescente"}
      >
        {sort.dir === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}

export function ResellerTable({
  rows,
  showManager = false,
  onAssign,
  sort,
  onSortChange,
}: ResellerTableProps) {
  // O seletor do mobile inclui "Cadastro", que não tem coluna na tabela: é a
  // ordenação PADRÃO, e sem a opção o `select` cairia na primeira da lista e
  // anunciaria uma ordem que não é a que está na tela.
  const sortableColumns: ResellerSortKey[] = showManager
    ? ["nome", "mrr", "vencimento", "alunos", "status", "gerente", "criacao"]
    : ["nome", "mrr", "vencimento", "alunos", "status", "criacao"]

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
              <SortableHead column="nome" sort={sort} onSortChange={onSortChange} />
              <SortableHead column="mrr" sort={sort} onSortChange={onSortChange} align="right" />
              <SortableHead column="vencimento" sort={sort} onSortChange={onSortChange} />
              <SortableHead column="alunos" sort={sort} onSortChange={onSortChange} align="right" />
              <SortableHead column="status" sort={sort} onSortChange={onSortChange} />
              {showManager && (
                <SortableHead column="gerente" sort={sort} onSortChange={onSortChange} />
              )}
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
      {sort && onSortChange && (
        <MobileSortControl
          sort={sort}
          onSortChange={onSortChange}
          columns={sortableColumns}
        />
      )}
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
