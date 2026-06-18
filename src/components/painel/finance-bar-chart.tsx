"use client"

import { useState } from "react"
import { BlockSkeleton } from "@/components/shared/loading-skeletons"

export interface ChartPoint {
  label: string
  value: number
}

interface FinanceBarChartProps {
  week: ChartPoint[]
  month: ChartPoint[]
  loading?: boolean
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

function formatCompact(value: number): string {
  return value.toLocaleString("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
}

export function FinanceBarChart({ week, month, loading }: FinanceBarChartProps) {
  const [view, setView] = useState<"semana" | "mes">("semana")
  const data = view === "semana" ? week : month
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {view === "semana"
              ? "Receita diária (últimos 7 dias)"
              : "Receita semanal (mês atual)"}
          </h3>
          <p className="mt-1 text-xs text-gray-600">Total recebido no período.</p>
        </div>
        <div
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-[var(--color-pmb-mist)] p-1"
          role="group"
          aria-label="Alternar visão do gráfico"
        >
          {(["semana", "mes"] as const).map((option) => {
            const active = view === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setView(option)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                    : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
                }`}
              >
                {option === "semana" ? "Semana" : "Mês"}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <BlockSkeleton className="mt-6 h-48" />
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-48 items-center justify-center text-xs text-gray-500">
          Sem dados no período
        </div>
      ) : (
        <div
          className="mt-6 flex h-52 items-end justify-between gap-3 border-b border-gray-200"
          role="img"
          aria-label={
            view === "semana"
              ? "Receita diária dos últimos 7 dias"
              : "Receita semanal do mês atual"
          }
        >
          {data.map((bar, i) => {
            const heightPct = (bar.value / max) * 100
            return (
              <div
                key={`${bar.label}-${i}`}
                className="flex h-full flex-1 flex-col items-center justify-end"
                title={`${bar.label}: ${formatBRL(bar.value)}`}
                aria-label={`${bar.label}: ${formatBRL(bar.value)}`}
              >
                <span className="mb-1 font-mono text-[10px] text-gray-500">
                  {formatCompact(bar.value)}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-green-700)]"
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
