import { formatCurrency } from "@/lib/utils"

export interface RevenueChartPoint {
  date: string
  revenue: number
}

interface RevenueChartProps {
  data: RevenueChartPoint[]
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function RevenueChart({ data }: RevenueChartProps) {
  const total = data.reduce((sum, p) => sum + p.revenue, 0)
  const values = data.map((p) => p.revenue)
  const max = values.length > 0 ? Math.max(...values) : 0
  const min = values.length > 0 ? Math.min(...values) : 0
  const range = max - min || 1

  const points = data
    .map((point, index) => {
      const x = data.length > 1 ? (index / (data.length - 1)) * 100 : 0
      const y = 100 - ((point.revenue - min) / range) * 100
      return `${x},${y}`
    })
    .join(" ")

  const areaPath = data.length > 0
    ? `M 0,100 L ${points} L 100,100 Z`
    : "M 0,100 L 100,100 Z"

  const firstLabel = data[0] ? formatShortDate(data[0].date) : ""
  const midIndex = Math.floor(data.length / 2)
  const midLabel = data[midIndex] ? formatShortDate(data[midIndex].date) : ""
  const lastLabel = data.length > 0 ? formatShortDate(data[data.length - 1].date) : ""

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Receita dos últimos 30 dias
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Acumulado no período:{" "}
            <span className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
              {formatCurrency(total)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 h-52 w-full">
        {data.length === 0 || total === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            Sem vendas no período.
          </div>
        ) : (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#areaFill)" />
            <polyline
              points={points}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      {data.length > 0 && (
        <div className="mt-2 flex justify-between text-[10px] text-gray-400">
          <span>{firstLabel}</span>
          <span>{midLabel}</span>
          <span>{lastLabel}</span>
        </div>
      )}
    </div>
  )
}
