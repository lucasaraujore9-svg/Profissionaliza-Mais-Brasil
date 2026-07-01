import type { ResolvedPeriod } from "./period"
import type { KpiDatum, ReportPayload, ReportSeries, ReportTable } from "./types"

/** Monta o envelope `ReportPayload` a partir das partes. Neutro (admin + painel). */
export function buildPayload(
  period: ResolvedPeriod,
  parts: { kpis?: KpiDatum[]; series?: ReportSeries[]; tables?: ReportTable[] },
): ReportPayload {
  return {
    period: {
      preset: period.preset,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
    },
    kpis: parts.kpis ?? [],
    series: parts.series ?? [],
    tables: parts.tables ?? [],
    generatedAt: new Date().toISOString(),
  }
}
