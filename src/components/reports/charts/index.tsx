"use client"

import dynamic from "next/dynamic"
import type { ComponentType } from "react"
import type { ReportSeries } from "@/lib/reports/types"
import { ChartSkeleton } from "../states"
import type { ChartCardProps } from "./props"

/**
 * Barrel dos cards de gráfico. Cada card é carregado via `dynamic(ssr:false)`:
 * como os hubs buscam dados no cliente, os gráficos nunca precisam de SSR, e
 * isso elimina os problemas de hidratação/ResizeObserver do Recharts, além de
 * carregar o bundle de charts sob demanda (chunk separado, pós-first-paint).
 */
const loading = () => <ChartSkeleton />

export const LineChartCard = dynamic(
  () => import("./line-chart-card").then((m) => m.LineChartCard),
  { ssr: false, loading },
) as ComponentType<ChartCardProps>

export const AreaChartCard = dynamic(
  () => import("./area-chart-card").then((m) => m.AreaChartCard),
  { ssr: false, loading },
) as ComponentType<ChartCardProps>

export const BarChartCard = dynamic(
  () => import("./bar-chart-card").then((m) => m.BarChartCard),
  { ssr: false, loading },
) as ComponentType<ChartCardProps & { stacked?: boolean; horizontal?: boolean }>

export const StackedBarCard = dynamic(
  () => import("./stacked-bar-card").then((m) => m.StackedBarCard),
  { ssr: false, loading },
) as ComponentType<ChartCardProps>

export const DonutChartCard = dynamic(
  () => import("./donut-chart-card").then((m) => m.DonutChartCard),
  { ssr: false, loading },
) as ComponentType<ChartCardProps>

export const FunnelChartCard = dynamic(
  () => import("./funnel-chart-card").then((m) => m.FunnelChartCard),
  { ssr: false, loading },
) as ComponentType<ChartCardProps>

/**
 * Renderiza qualquer `ReportSeries` do payload conforme o `kind`. É o coração
 * do `ReportTabView` genérico — abas novas não precisam escrever React de chart.
 */
export function SeriesChart({ series }: { series: ReportSeries }) {
  const common: ChartCardProps = {
    title: series.title,
    subtitle: series.subtitle,
    data: series.points,
    xKey: series.xKey,
    series: series.series,
  }
  switch (series.kind) {
    case "line":
      return <LineChartCard {...common} />
    case "area":
      return <AreaChartCard {...common} />
    case "bar":
      return <BarChartCard {...common} />
    case "stacked-bar":
      return <StackedBarCard {...common} />
    case "donut":
      return <DonutChartCard {...common} />
    case "funnel":
      return <FunnelChartCard {...common} />
    default:
      return null
  }
}
