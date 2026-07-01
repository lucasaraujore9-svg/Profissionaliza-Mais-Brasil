import { PMB } from "../theme"

/**
 * Mini-gráfico de linha em SVG inline (sem Recharts). Usado nos KpiCards —
 * montar um ResponsiveContainer por card seria desperdício, então mantemos os
 * sparklines fora do Recharts.
 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = PMB.green,
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = width / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / span) * (height - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
