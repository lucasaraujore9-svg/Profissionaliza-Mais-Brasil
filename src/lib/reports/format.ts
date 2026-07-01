import { formatCurrency } from "@/lib/utils"
import type { ReportFormat } from "./types"

/**
 * Formatação numérica compartilhada pelos hubs de BI. Consolida as várias
 * cópias ad-hoc de `formatShortCurrency`/`formatCompact` que existiam nos
 * componentes de chart, e reusa `formatCurrency` (pt-BR BRL) de `@/lib/utils`.
 */

const numberFmt = new Intl.NumberFormat("pt-BR")

/** "R$ 1,2 mil" / "R$ 3,4 mi" — compacto para eixos e KPIs grandes. */
export function formatShortCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")} mil`
  return formatCurrency(value)
}

/** "1,2 mil" / "3,4 mi" — compacto para contagens grandes. */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(".", ",")} mil`
  return numberFmt.format(value)
}

export function formatNumber(value: number): string {
  return numberFmt.format(value)
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace(".", ",")}%`
}

export interface DeltaInfo {
  pct: number | null
  dir: "up" | "down" | "flat"
  label: string
}

/**
 * Direção e rótulo da variação percentual entre `current` e `previous`.
 * `pct = null` quando não há base comparável (previous ≤ 0). Rótulo sempre
 * com sinal ("+12,3%" / "-4,0%" / "—").
 */
export function formatDelta(current: number, previous: number): DeltaInfo {
  if (previous <= 0) {
    if (current > 0) return { pct: 100, dir: "up", label: "+100%" }
    return { pct: null, dir: "flat", label: "—" }
  }
  const pct = ((current - previous) / previous) * 100
  const dir = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat"
  const sign = pct > 0 ? "+" : ""
  return { pct, dir, label: `${sign}${pct.toFixed(1).replace(".", ",")}%` }
}

/** Formata um valor segundo o `ReportFormat` do contrato (KPIs, tabelas, tooltips). */
export function formatByFormat(value: number | string | null, format: ReportFormat): string {
  if (value === null || value === undefined) return "—"
  if (format === "text") return String(value)
  const n = typeof value === "number" ? value : Number(value)
  if (Number.isNaN(n)) return String(value)
  switch (format) {
    case "currency":
      return formatCurrency(n)
    case "compact-currency":
      return formatShortCurrency(n)
    case "percent":
      return formatPercent(n)
    case "number":
      return formatNumber(n)
  }
}
