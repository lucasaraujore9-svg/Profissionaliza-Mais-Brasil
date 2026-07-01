"use client"

import { formatByFormat } from "@/lib/reports/format"
import { ChartFrame } from "./chart-frame"
import { seriesColor } from "../theme"
import type { ChartCardProps } from "./props"

/**
 * Funil / distribuição por estágio. Contrato: `data` (points) com `{ x, value }`.
 * As barras são dimensionadas em relação ao MAIOR valor e limitadas a 100% da
 * pista, então nunca escapam do card — mesmo quando os dados não são
 * monotonicamente decrescentes (ex.: "Funil de revendas" por status).
 * A coluna de conversão (%) só aparece quando os dados formam um funil real
 * (decrescente), evitando percentuais sem sentido (ex.: 72/1 = 7200%).
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
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  const isEmpty = rows.length === 0 || max === 0
  const fmt = series[0]?.format ?? valueFormat
  const isFunnel = rows.every((r, i) => i === 0 || r.value <= rows[i - 1].value)

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
          const widthPct = max > 0 ? Math.min(Math.max((r.value / max) * 100, 6), 100) : 6
          const conv =
            isFunnel && i > 0 && rows[i - 1].value > 0
              ? Math.round((r.value / rows[i - 1].value) * 100)
              : null
          return (
            <div key={r.name} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-xs text-gray-600">{r.name}</div>
              <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded bg-gray-100">
                <div
                  className="flex h-full items-center rounded px-2 text-[11px] font-semibold text-white"
                  style={{ width: `${widthPct}%`, background: seriesColor(i) }}
                >
                  <span className="truncate">{formatByFormat(r.value, fmt)}</span>
                </div>
              </div>
              {isFunnel && (
                <div className="w-14 shrink-0 text-right text-[11px] text-gray-400">
                  {conv !== null ? `${conv}%` : ""}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ChartFrame>
  )
}
