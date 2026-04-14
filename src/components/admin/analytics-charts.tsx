interface ChartWrapperProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

function ChartWrapper({ title, subtitle, children }: ChartWrapperProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">{title}</h3>
      <p className="mt-0.5 text-xs text-gray-600">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function LineChart({ values, color }: { values: number[]; color: string }) {
  const width = 320
  const height = 120
  const max = Math.max(...values) * 1.1
  const step = width / (values.length - 1)
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BarChart({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values)
  return (
    <div className="flex h-[120px] items-end gap-2">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md"
          style={{
            height: `${(v / max) * 100}%`,
            background: color,
            minHeight: "4px",
          }}
        />
      ))}
    </div>
  )
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const radius = 45
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
        {segments.map((seg) => {
          const length = (seg.value / total) * circumference
          const dasharray = `${length} ${circumference - length}`
          const dashoffset = -offset
          offset += length
          return (
            <circle
              key={seg.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="14"
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
            />
          )
        })}
      </svg>
      <ul className="space-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-gray-600">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span>{s.label}</span>
            <span className="font-mono font-semibold text-[#1A1A2E]">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AnalyticsCharts() {
  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <ChartWrapper title="Receita mensal" subtitle="MRR últimos 6 meses">
        <LineChart values={[64, 72, 86, 96, 118, 148]} color="#3B82F6" />
      </ChartWrapper>
      <ChartWrapper title="Crescimento de alunos" subtitle="Matrículas por mês">
        <LineChart values={[840, 920, 1010, 1140, 1220, 1284]} color="#10B981" />
      </ChartWrapper>
      <ChartWrapper title="Conversão checkout" subtitle="% por semana">
        <BarChart
          values={[5.2, 6.1, 5.8, 7.0, 7.8, 8.2]}
          color="linear-gradient(180deg, #6366F1, #3B82F6)"
        />
      </ChartWrapper>
      <ChartWrapper title="Distribuição revendedores" subtitle="Por plano contratado">
        <DonutChart
          segments={[
            { label: "Growth (R$ 297)", value: 62, color: "#3B82F6" },
            { label: "Starter (R$ 197)", value: 28, color: "#10B981" },
            { label: "Free trial", value: 10, color: "#F59E0B" },
          ]}
        />
      </ChartWrapper>
      <ChartWrapper title="Origem dos alunos" subtitle="Canais de aquisição" >
        <DonutChart
          segments={[
            { label: "Orgânico", value: 48, color: "#6366F1" },
            { label: "Ads", value: 32, color: "#F97316" },
            { label: "Indicação", value: 20, color: "#14B8A6" },
          ]}
        />
      </ChartWrapper>
      <ChartWrapper title="Satisfação (NPS)" subtitle="Média mensal">
        <BarChart
          values={[62, 68, 71, 74, 79, 82]}
          color="linear-gradient(180deg, #F59E0B, #F97316)"
        />
      </ChartWrapper>
    </div>
  )
}
