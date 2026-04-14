import { formatCurrency } from "@/lib/utils"

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

const statusLabels: Record<RecentSale["status"], string> = {
  PENDING: "Pendente",
  ACTIVE: "Aprovado",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
}

const statusColors: Record<RecentSale["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-red-100 text-red-700",
  COMPLETED: "bg-blue-100 text-blue-700",
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
        <h3 className="text-sm font-semibold text-[#1A1A2E]">
          Vendas recentes
        </h3>
        <a
          href="/painel/financeiro"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Ver todas →
        </a>
      </div>

      {sales.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">Nenhuma venda registrada ainda.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {sales.map((sale) => (
            <li
              key={sale.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                  {sale.studentName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#1A1A2E]">
                    {sale.studentName}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {sale.courseName} · {relativeTime(sale.createdAt)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-[#1A1A2E]">
                  {formatCurrency(sale.amount)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[sale.status]}`}
                >
                  {statusLabels[sale.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
