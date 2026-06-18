import { Receipt } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { EmptyState } from "@/components/shared/empty-state"
import { SaleStatusBadge } from "./sale-status"

export interface RecentSale {
  id: string
  studentName: string
  courseName: string
  amount: number
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "COMPLETED"
  createdAt: string
}

interface RecentSalesProps {
  sales: RecentSale[]
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Agora"
  if (minutes < 60) return `Há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Ontem"
  if (days < 7) return `Há ${days} dias`
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function RecentSales({ sales }: RecentSalesProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Vendas recentes
        </h3>
        <a
          href="/painel/vendas"
          className="text-xs font-semibold text-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-700)]"
        >
          Ver todas →
        </a>
      </div>

      {sales.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={Receipt}
          title="Nenhuma venda registrada ainda"
          description="As vendas mais recentes da sua vitrine vão aparecer aqui."
        />
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {sales.map((sale) => (
            <li
              key={sale.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)] text-xs font-semibold text-[var(--color-pmb-green-700)]">
                  {sale.studentName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--color-pmb-green-900)]">
                    {sale.studentName}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {sale.courseName} · {relativeTime(sale.createdAt)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {formatCurrency(sale.amount)}
                </span>
                <SaleStatusBadge status={sale.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
