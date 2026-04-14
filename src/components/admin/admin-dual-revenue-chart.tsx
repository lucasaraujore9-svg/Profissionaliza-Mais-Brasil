"use client"

export interface RevenuePoint {
  label: string
  bruta: number
  liquida: number
}

export type RevenuePeriod = "30d" | "90d" | "12m"

interface AdminDualRevenueChartProps {
  period: RevenuePeriod
  points: RevenuePoint[]
  onPeriodChange: (period: RevenuePeriod) => void
}

const PERIODS: RevenuePeriod[] = ["30d", "90d", "12m"]

function formatShortCurrency(value: number): string {
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`
  return `R$ ${value.toFixed(0)}`
}

function toPoints(values: number[], max: number, height: number, width: number): string {
  if (values.length === 0) return ""
  if (values.length === 1) {
    const y = height - (values[0] / max) * height
    return `0,${y} ${width},${y}`
  }
  const step = width / (values.length - 1)
  return values
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(" ")
}

export function AdminDualRevenueChart({
  period,
  points,
  onPeriodChange,
}: AdminDualRevenueChartProps) {
  const bruta = points.map((p) => p.bruta)
  const liquida = points.map((p) => p.liquida)
  const labels = points.map((p) => p.label)
  const max = Math.max(...bruta, 1) * 1.1
  const width = 560
  const height = 180

  const brutaLine = toPoints(bruta, max, height, width)
  const liquidaLine = toPoints(liquida, max, height, width)
  const latestBruta = bruta[bruta.length - 1] ?? 0
  const latestLiquida = liquida[liquida.length - 1] ?? 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Receita global</h3>
          <p className="mt-1 text-xs text-gray-600">
            Comparativo entre receita bruta e líquida (pós-taxas).
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                period === p ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-2 text-gray-600">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          Bruta:{" "}
          <span className="font-mono font-semibold text-[#1A1A2E]">
            {formatShortCurrency(latestBruta)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-gray-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Líquida:{" "}
          <span className="font-mono font-semibold text-[#1A1A2E]">
            {formatShortCurrency(latestLiquida)}
          </span>
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        {points.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
            Sem dados no período selecionado.
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full">
            <defs>
              <linearGradient id="brutaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`M 0,${height} L ${brutaLine} L ${width},${height} Z`}
              fill="url(#brutaFill)"
            />
            <polyline
              points={brutaLine}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={liquidaLine}
              fill="none"
              stroke="#10B981"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {labels.map((label, i) => {
              const step = labels.length > 1 ? width / (labels.length - 1) : width / 2
              return (
                <text
                  key={`${label}-${i}`}
                  x={i * step}
                  y={height + 18}
                  textAnchor="middle"
                  className="fill-gray-400 text-[10px]"
                >
                  {label}
                </text>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
