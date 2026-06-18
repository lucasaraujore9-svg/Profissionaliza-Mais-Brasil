import { Receipt } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { TableRowsSkeleton } from "@/components/shared/loading-skeletons"

export interface CouponUsageItem {
  id: string
  studentName: string
  courseName: string
  discountAmount: number
  createdAt: string
}

interface CouponUsageTableProps {
  usages: CouponUsageItem[]
  loading?: boolean
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return "—"
  }
}

export function CouponUsageTable({ usages, loading }: CouponUsageTableProps) {
  if (loading) {
    return <TableRowsSkeleton rows={4} cols={4} />
  }

  if (usages.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhum uso registrado"
        description="Quando alunos aplicarem este cupom no checkout, os usos aparecerão aqui."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Aluno</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Curso</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Desconto</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {usages.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-2 text-sm text-[var(--color-pmb-green-900)]">{u.studentName}</td>
              <td className="px-4 py-2 text-sm text-gray-600">{u.courseName}</td>
              <td className="px-4 py-2 font-mono text-sm font-semibold text-[var(--color-pmb-green-700)]">
                -{formatCurrency(u.discountAmount)}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">{formatDate(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
