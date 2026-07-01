"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ReportFormat } from "@/lib/reports/types"
import { formatByFormat } from "@/lib/reports/format"
import { ChartFrame } from "./chart-frame"
import { ChartTooltip } from "./chart-tooltip"
import { axisProps, gridProps, seriesColor } from "../theme"
import { buildFormatByKey, type ChartCardProps } from "./props"

export function LineChartCard({
  title,
  subtitle,
  data,
  xKey = "x",
  series,
  height = 260,
  valueFormat = "number",
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
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
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
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export type { ReportFormat }
