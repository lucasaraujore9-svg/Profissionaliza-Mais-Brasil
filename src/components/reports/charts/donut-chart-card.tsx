"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { formatByFormat } from "@/lib/reports/format"
import { ChartFrame } from "./chart-frame"
import { ChartTooltip } from "./chart-tooltip"
import { seriesColor } from "../theme"
import type { ChartCardProps } from "./props"

/**
 * Donut/pizza. Contrato: `series[0]` define a métrica; `data` (points) carrega
 * `{ x: nome, value: número }`. Renderiza total ao centro + legenda lateral.
 */
export function DonutChartCard({
  title,
  subtitle,
  data,
  series,
  height = 260,
  valueFormat = "number",
  emptyLabel,
  actions,
}: ChartCardProps) {
  const meta = series[0]
  const rows = data.map((p) => ({
    name: String(p.x),
    value: Number(p.value ?? 0),
  }))
  const total = rows.reduce((acc, r) => acc + r.value, 0)
  const isEmpty = rows.length === 0 || total === 0
  const fmt = meta?.format ?? valueFormat
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      actions={actions}
      height={height}
      isEmpty={isEmpty}
      emptyLabel={emptyLabel}
    >
      <div className="flex h-full items-center gap-4">
        <div className="relative h-full flex-1">
          <ResponsiveContainer width="100%" height="100%" debounce={80}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="name"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={1.5}
                stroke="none"
              >
                {rows.map((r, i) => (
                  <Cell key={r.name} fill={seriesColor(i)} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip formatByKey={{ value: fmt }} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Total</span>
            <span className="text-sm font-bold text-[var(--color-pmb-green-900)]">
              {formatByFormat(total, fmt)}
            </span>
          </div>
        </div>
        <ul className="w-40 space-y-1.5 text-xs">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: seriesColor(i) }}
              />
              <span className="min-w-0 flex-1 truncate text-gray-600">{r.name}</span>
              <span className="font-semibold text-gray-900">
                {total > 0 ? `${Math.round((r.value / total) * 100)}%` : "0%"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  )
}
