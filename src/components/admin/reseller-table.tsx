import Link from "next/link"
import { Eye } from "lucide-react"

export type ResellerStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "CANCELLED"

export interface ResellerRow {
  id: string
  name: string
  slug: string
  email: string | null
  mrr: number
  students: number
  status: ResellerStatus
  createdAt: string
}

interface ResellerTableProps {
  rows: ResellerRow[]
}

const STATUS_STYLES: Record<ResellerStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-gray-200 text-gray-600",
}

const STATUS_LABEL: Record<ResellerStatus, string> = {
  ACTIVE: "ativo",
  PENDING: "pendente",
  SUSPENDED: "suspenso",
  CANCELLED: "cancelado",
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ResellerTable({ rows }: ResellerTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Nenhum revendedor encontrado com os filtros atuais.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">MRR</th>
              <th className="px-6 py-3 font-medium">Alunos</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <td className="px-6 py-3">
                  <p className="font-semibold text-[var(--color-pmb-green-900)]">{r.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{r.email ?? r.slug}</p>
                </td>
                <td className="px-6 py-3 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                  {formatMoney(r.mrr)}
                </td>
                <td className="px-6 py-3 font-mono text-gray-700">
                  {r.students.toLocaleString("pt-BR")}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/revendedores/${r.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-[var(--color-pmb-lime-50)] hover:text-[var(--color-pmb-green)]"
                      aria-label="Ver"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
