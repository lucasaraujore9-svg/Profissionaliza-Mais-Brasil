import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

export interface TopResellerRow {
  id: string
  name: string
  slug: string
  status: string
  mrr: number
  students: number
}

interface AdminTopResellersTableProps {
  resellers: TopResellerRow[]
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-gray-100 text-gray-700",
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "ativo",
  PENDING: "pendente",
  SUSPENDED: "suspenso",
  CANCELLED: "cancelado",
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

export function AdminTopResellersTable({ resellers }: AdminTopResellersTableProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Top revendedores</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Rankeados por receita no período.
          </p>
        </div>
        <Link
          href="/admin/revendedores"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Ver todos
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">Receita</th>
              <th className="px-6 py-3 font-medium">Alunos</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {resellers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-xs text-gray-500">
                  Nenhum revendedor encontrado no período.
                </td>
              </tr>
            )}
            {resellers.map((r, idx) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gray-400">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium text-[#1A1A2E]">{r.name}</span>
                  </div>
                </td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">
                  {formatCurrency(r.mrr)}
                </td>
                <td className="px-6 py-3 font-mono text-gray-700">{r.students}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[r.status] ?? r.status.toLowerCase()}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <Link
                    href={`/admin/revendedores/${r.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Ver
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
