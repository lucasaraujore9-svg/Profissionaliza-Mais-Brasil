"use client"

import {
  Area,
  AreaChart,
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

export function AreaChartCard({
  title,
  subtitle,
  data,
  xKey = "x",
  series,
  height = 260,
  valueFormat = "currency",
  emptyLabel,
  actions,
}: ChartCardProps) {
  const formatByKey = buildFormatByKey(series, valueFormat)
  const isEmpty = data.length === 0
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
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            {series.map((s, i) => {
              const color = s.color ?? seriesColor(i)
              return (
                <linearGradient
                  key={s.key}
                  id={`grad-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              )
            })}
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis
            {...axisProps}
            width={52}
            tickFormatter={(v: number) =>
              formatByFormat(v, valueFormat === "currency" ? "compact-currency" : valueFormat)
            }
          />
          <Tooltip
            content={<ChartTooltip formatByKey={formatByKey} />}
            cursor={{ stroke: "#E5E7EB" }}
          />
          {series.map((s, i) => {
            const color = s.color ?? seriesColor(i)
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${s.key})`}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
