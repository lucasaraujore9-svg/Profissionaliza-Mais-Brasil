import type { ReactNode } from "react"
import type { ChartSeriesMeta, ReportFormat, SeriesPoint } from "@/lib/reports/types"

/** Props comuns a todos os cards de gráfico (Recharts). Presentation-only. */
export interface ChartCardProps {
  title: string
  subtitle?: string
  data: SeriesPoint[]
  /** Chave do eixo X nos points (padrão "x"). */
  xKey?: string
  series: ChartSeriesMeta[]
  height?: number
  /** Formato do eixo de valor + tooltip quando a série não define o seu. */
  valueFormat?: ReportFormat
  emptyLabel?: string
  actions?: ReactNode
}

export function buildFormatByKey(
  series: ChartSeriesMeta[],
  fallback: ReportFormat,
): Record<string, ReportFormat> {
  const out: Record<string, ReportFormat> = {}
  for (const s of series) out[s.key] = s.format ?? fallback
  return out
}
