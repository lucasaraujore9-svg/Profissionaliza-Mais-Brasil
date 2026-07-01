"use client"

import type { PeriodPreset } from "@/lib/reports/period"
import { cn } from "@/lib/utils"

export interface PeriodValue {
  preset: PeriodPreset
  from?: string
  to?: string
}

const DEFAULT_PRESETS: { id: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "12m", label: "12 meses" },
]

/**
 * Barra de filtro de período: chips de preset + intervalo custom (from/to).
 * Controlada — o estado (na URL) vive no consumidor. Selecionar um preset limpa
 * o intervalo custom e vice-versa.
 */
export function PeriodFilter({
  value,
  onChange,
  presets = DEFAULT_PRESETS.map((p) => p.id),
  className,
}: {
  value: PeriodValue
  onChange: (v: PeriodValue) => void
  presets?: Exclude<PeriodPreset, "custom">[]
  className?: string
}) {
  const visible = DEFAULT_PRESETS.filter((p) => presets.includes(p.id))
  const isCustom = value.preset === "custom"

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {visible.map((p) => {
          const active = !isCustom && value.preset === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ preset: p.id })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={isCustom ? (value.from ?? "") : ""}
          onChange={(e) =>
            onChange({ preset: "custom", from: e.target.value, to: value.to })
          }
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
          aria-label="Data inicial"
        />
        <span className="text-xs text-gray-400">até</span>
        <input
          type="date"
          value={isCustom ? (value.to ?? "") : ""}
          onChange={(e) =>
            onChange({ preset: "custom", from: value.from, to: e.target.value })
          }
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
          aria-label="Data final"
        />
        {isCustom && (
          <button
            type="button"
            onClick={() => onChange({ preset: "30d" })}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  )
}
