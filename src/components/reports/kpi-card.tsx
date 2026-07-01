"use client"

import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import type { KpiDatum } from "@/lib/reports/types"
import { formatByFormat, formatDelta } from "@/lib/reports/format"
import { cn } from "@/lib/utils"
import { renderReportIcon } from "./icons"
import { Sparkline } from "./charts/sparkline"
import { PMB } from "./theme"

/**
 * Card de KPI: valor + variação vs. período anterior (pílula ↑/↓) + sparkline
 * opcional. Data-driven pelo `KpiDatum` do payload.
 */
export function KpiCard({ kpi }: { kpi: KpiDatum }) {
  // Delta: usa deltaPct explícito do servidor; senão deriva de previousValue.
  const delta =
    kpi.deltaPct !== undefined && kpi.deltaPct !== null
      ? {
          pct: kpi.deltaPct,
          dir: kpi.deltaPct > 0.05 ? "up" : kpi.deltaPct < -0.05 ? "down" : "flat",
          label: `${kpi.deltaPct > 0 ? "+" : ""}${kpi.deltaPct.toFixed(1).replace(".", ",")}%`,
        }
      : kpi.previousValue !== undefined
        ? formatDelta(kpi.value, kpi.previousValue)
        : null

  // Cor do delta: por padrão subir = verde. `invertDelta` troca (ex.: inadimplência).
  const good = delta ? (kpi.invertDelta ? delta.dir === "down" : delta.dir === "up") : false
  const bad = delta ? (kpi.invertDelta ? delta.dir === "up" : delta.dir === "down") : false

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{kpi.label}</span>
        {renderReportIcon(kpi.icon, "h-4 w-4 text-[var(--color-pmb-green)]")}
      </div>
      {kpi.format === "text" ? (
        <div
          className="mt-2 truncate text-base font-semibold text-[var(--color-pmb-green-900)]"
          title={kpi.text ?? undefined}
        >
          {kpi.text ?? "—"}
        </div>
      ) : (
        <div className="mt-2 font-mono text-xl font-bold tracking-tight text-[var(--color-pmb-green-900)]">
          {formatByFormat(kpi.value, kpi.format)}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {delta && delta.pct !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              good && "bg-green-50 text-green-700",
              bad && "bg-red-50 text-red-700",
              !good && !bad && "bg-gray-100 text-gray-500",
            )}
          >
            {delta.dir === "up" && <ArrowUpRight className="h-3 w-3" />}
            {delta.dir === "down" && <ArrowDownRight className="h-3 w-3" />}
            {delta.label}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">{kpi.hint ?? ""}</span>
        )}
        {kpi.spark && kpi.spark.length > 1 && (
          <Sparkline values={kpi.spark} color={good ? PMB.green : bad ? PMB.negative : PMB.axis} />
        )}
      </div>
    </div>
  )
}
