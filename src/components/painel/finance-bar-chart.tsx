"use client"

import { useState } from "react"

export interface ChartPoint {
  label: string
  value: number
}

interface FinanceBarChartProps {
  week: ChartPoint[]
  month: ChartPoint[]
}

export function FinanceBarChart({ week, month }: FinanceBarChartProps) {
  const [view, setView] = useState<"semana" | "mes">("semana")
  const data = view === "semana" ? week : month
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">
            Receita por {view === "semana" ? "dia" : "semana"}
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Total recebido no período.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {(["semana", "mes"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                view === option
                  ? "bg-white text-[#1A1A2E] shadow-sm"
                  : "text-gray-600"
              }`}
            >
              {option === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="mt-6 flex h-48 items-center justify-center text-xs text-gray-500">
          Sem dados no período
        </div>
      ) : (
        <div className="mt-6 flex h-48 items-end justify-between gap-3">
          {data.map((bar, i) => {
            const heightPct = (bar.value / max) * 100
            return (
              <div
                key={`${bar.label}-${i}`}
                className="flex flex-1 flex-col items-center"
                title={`R$ ${bar.value.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}`}
              >
                <div className="flex h-full w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-indigo-500 transition-all"
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                  />
                </div>
                <span className="mt-2 text-[10px] font-medium text-gray-500">
                  {bar.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
