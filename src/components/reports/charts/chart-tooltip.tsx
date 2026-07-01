"use client"

import type { ReportFormat } from "@/lib/reports/types"
import { formatByFormat } from "@/lib/reports/format"

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

/**
 * Tooltip compartilhado, estilizado no padrão PMB. Recebe o `formatByKey`
 * para formatar cada série conforme seu `ReportFormat`.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatByKey,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatByKey?: Record<string, ReportFormat>
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      {label !== undefined && (
        <p className="mb-1 font-semibold text-[var(--color-pmb-green-900)]">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => {
          const key = String(entry.dataKey ?? entry.name ?? i)
          const fmt = formatByKey?.[key] ?? "number"
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="text-gray-600">{entry.name}:</span>
              <span className="font-semibold text-gray-900">
                {formatByFormat(entry.value ?? null, fmt)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
