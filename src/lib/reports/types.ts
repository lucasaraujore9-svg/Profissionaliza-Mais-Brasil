import type { PeriodPreset } from "./period"

/**
 * Contrato de dados único dos hubs de BI (admin + painel). Todo endpoint de
 * aba devolve um `ReportPayload` dentro do envelope `{ data }`. Um renderizador
 * genérico (`ReportTabView`) desenha qualquer payload — adicionar uma aba é,
 * na maioria dos casos, só escrever um builder no servidor.
 */

export type ReportFormat =
  | "currency"
  | "compact-currency"
  | "number"
  | "percent"
  | "text"

export interface KpiDatum {
  key: string
  label: string
  value: number
  /** Valor textual quando `format === "text"` (ex.: nome do curso campeão). */
  text?: string
  /** Valor da janela anterior (para o delta), quando aplicável. */
  previousValue?: number
  /** Delta já calculado no servidor; se ausente, deriva de value/previousValue. */
  deltaPct?: number | null
  format: ReportFormat
  /** Nome de ícone lucide (mapeado para componente no cliente). */
  icon?: string
  /** Série curta para o sparkline (SVG inline, sem Recharts). */
  spark?: number[]
  hint?: string
  /** Inverte a semântica de cor do delta (queda = bom, ex.: inadimplência). */
  invertDelta?: boolean
}

export interface SeriesPoint {
  x: string
  [seriesKey: string]: number | string
}

export interface ChartSeriesMeta {
  key: string
  label: string
  /** Hex opcional; se ausente, cicla o SERIES_PALETTE do tema. */
  color?: string
  format?: ReportFormat
}

export type ChartKind = "line" | "area" | "bar" | "stacked-bar" | "donut" | "funnel"

export interface ReportSeries {
  id: string
  kind: ChartKind
  title: string
  subtitle?: string
  /** Chave do eixo X nos points (normalmente "x"). */
  xKey: string
  /** Metadados das séries; donut/funnel usam 1 meta e points com {x, value}. */
  series: ChartSeriesMeta[]
  points: SeriesPoint[]
}

export interface ReportTableColumn {
  key: string
  label: string
  format?: ReportFormat
  align?: "left" | "right" | "center"
  sortable?: boolean
  /** Template de link por linha, ex.: "/admin/revendedores/{id}". */
  href?: string
}

export interface ReportTable {
  id: string
  title: string
  subtitle?: string
  columns: ReportTableColumn[]
  rows: Record<string, string | number | null>[]
  /** Endpoint de exportação CSV desta tabela (usa csvResponse no servidor). */
  exportHref?: string
}

export interface ReportPayload {
  period: { preset: PeriodPreset; start: string; end: string; label: string }
  kpis: KpiDatum[]
  series: ReportSeries[]
  tables: ReportTable[]
  generatedAt: string
}
