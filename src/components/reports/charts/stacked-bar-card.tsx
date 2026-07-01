"use client"

import { BarChartCard } from "./bar-chart-card"
import type { ChartCardProps } from "./props"

/** Atalho para barras empilhadas (mesmo componente do BarChartCard). */
export function StackedBarCard(props: ChartCardProps) {
  return <BarChartCard {...props} stacked />
}
