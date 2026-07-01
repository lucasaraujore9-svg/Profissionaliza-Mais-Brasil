"use client"

import type { KpiDatum } from "@/lib/reports/types"
import { cn } from "@/lib/utils"
import { KpiCard } from "./kpi-card"

/** Grade responsiva de KpiCards. */
export function KpiGrid({ kpis, className }: { kpis: KpiDatum[]; className?: string }) {
  if (kpis.length === 0) return null
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  )
}
