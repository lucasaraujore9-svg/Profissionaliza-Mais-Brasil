"use client"

import { useState } from "react"

const PERIODS = ["30d", "90d", "12m"] as const
type Period = (typeof PERIODS)[number]

const DATA: Record<Period, { bruta: number[]; liquida: number[]; labels: string[] }> = {
  "30d": {
    labels: ["1", "5", "10", "15", "20", "25", "30"],
    bruta: [82, 96, 110, 118, 130, 142, 148],
    liquida: [58, 68, 78, 84, 92, 102, 108],
  },
  "90d": {
    labels: ["jan", "fev", "mar"],
    bruta: [110, 126, 148],
    liquida: [78, 90, 108],
  },
  "12m": {
    labels: ["mai", "jul", "set", "nov", "jan", "mar"],
    bruta: [64, 72, 86, 96, 118, 148],
    liquida: [46, 52, 62, 70, 86, 108],
  },
}

function toPoints(values: number[], max: number, height: number, width: number) {
  const step = width / (values.length - 1)
  return values
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(" ")
}

export function AdminDualRevenueChart() {
  const [period, setPeriod] = useState<Period>("30d")
  const data = DATA[period]
  const max = Math.max(...data.bruta) * 1.1
  const width = 560
  const height = 180

  const brutaPoints = toPoints(data.bruta, max, height, width)
  const liquidaPoints = toPoints(data.liquida, max, height, width)
  const latestBruta = data.bruta[data.bruta.length - 1]
  const latestLiquida = data.liquida[data.liquida.length - 1]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Receita global</h3>
          <p className="mt-1 text-xs text-gray-600">
            Comparativo entre receita bruta e líquida (pós-taxas Asaas).
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
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
          <span className="font-mono font-semibold text-[#1A1A2E]">R$ {latestBruta}k</span>
        </span>
        <span className="flex items-center gap-2 text-gray-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Líquida:{" "}
          <span className="font-mono font-semibold text-[#1A1A2E]">R$ {latestLiquida}k</span>
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full">
          <defs>
            <linearGradient id="brutaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M 0,${height} L ${brutaPoints} L ${width},${height} Z`}
            fill="url(#brutaFill)"
          />
          <polyline
            points={brutaPoints}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={liquidaPoints}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.labels.map((label, i) => {
            const step = width / (data.labels.length - 1)
            return (
              <text
                key={label}
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
      </div>
    </div>
  )
}
