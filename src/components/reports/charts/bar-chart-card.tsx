"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatByFormat } from "@/lib/reports/format"
import { ChartFrame } from "./chart-frame"
import { ChartTooltip } from "./chart-tooltip"
import { axisProps, gridProps, seriesColor } from "../theme"
import { buildFormatByKey, type ChartCardProps } from "./props"

interface BarChartCardProps extends ChartCardProps {
  /** Empilha as séries no mesmo eixo (stacked-bar). */
  stacked?: boolean
  /** Barras horizontais (layout vertical do Recharts) — bom p/ rankings. */
  horizontal?: boolean
}

export function BarChartCard({
  title,
  subtitle,
  data,
  xKey = "x",
  series,
  height = 260,
  valueFormat = "number",
  emptyLabel,
  actions,
  stacked = false,
  horizontal = false,
}: BarChartCardProps) {
  const formatByKey = buildFormatByKey(series, valueFormat)
  const isEmpty = data.length === 0
  const valueTick = (v: number) =>
    formatByFormat(v, valueFormat === "currency" ? "compact-currency" : valueFormat)
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      actions={actions}
      height={height}
      isEmpty={isEmpty}
      emptyLabel={emptyLabel}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={80}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : 4 }}
        >
          <CartesianGrid {...gridProps} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axisProps} tickFormatter={valueTick} />
              <YAxis type="category" dataKey={xKey} {...axisProps} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} width={52} tickFormatter={valueTick} />
            </>
          )}
          <Tooltip
            content={<ChartTooltip formatByKey={formatByKey} />}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? seriesColor(i)}
              stackId={stacked ? "stack" : undefined}
              radius={stacked ? 0 : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 22 : 48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
