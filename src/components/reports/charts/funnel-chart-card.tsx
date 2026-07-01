"use client"

import { formatByFormat } from "@/lib/reports/format"
import { ChartFrame } from "./chart-frame"
import { seriesColor } from "../theme"
import type { ChartCardProps } from "./props"

/**
 * Funil de estágios. Contrato: `data` (points) com `{ x: estágio, value }`,
 * ordenados do topo (maior) para a base. Renderizado como barras horizontais
 * de largura decrescente + taxa de passagem entre estágios — presentation-only
 * (sem Recharts, sempre renderiza).
 */
export function FunnelChartCard({
  title,
  subtitle,
  data,
  series,
  height = 260,
  valueFormat = "number",
  emptyLabel,
  actions,
}: ChartCardProps) {
  const rows = data.map((p) => ({ name: String(p.x), value: Number(p.value ?? 0) }))
  const top = rows[0]?.value ?? 0
  const isEmpty = rows.length === 0 || top === 0
  const fmt = series[0]?.format ?? valueFormat
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      actions={actions}
      height={height}
      isEmpty={isEmpty}
      emptyLabel={emptyLabel}
    >
      <div className="flex h-full flex-col justify-center gap-2">
        {rows.map((r, i) => {
          const widthPct = top > 0 ? Math.max((r.value / top) * 100, 6) : 6
          const conv =
            i > 0 && rows[i - 1].value > 0
              ? Math.round((r.value / rows[i - 1].value) * 100)
              : null
          return (
            <div key={r.name} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-xs text-gray-600">{r.name}</div>
              <div className="relative h-8 flex-1 rounded bg-gray-100">
                <div
                  className="flex h-full items-center rounded px-2 text-[11px] font-semibold text-white"
                  style={{ width: `${widthPct}%`, background: seriesColor(i) }}
                >
                  {formatByFormat(r.value, fmt)}
                </div>
              </div>
              <div className="w-14 shrink-0 text-right text-[11px] text-gray-400">
                {conv !== null ? `${conv}%` : ""}
              </div>
            </div>
          )
        })}
      </div>
    </ChartFrame>
  )
}
