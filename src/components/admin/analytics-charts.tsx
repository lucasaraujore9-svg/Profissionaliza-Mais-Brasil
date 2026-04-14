export interface AnalyticsChartsData {
  months: string[]
  revenueByMonth: number[]
  studentsByMonth: number[]
  conversionByMonth: number[]
  distribution: { label: string; value: number }[]
}

interface AnalyticsChartsProps {
  data: AnalyticsChartsData
}

const DONUT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#6366F1", "#F97316", "#14B8A6"]

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
  if (values.length === 0) {
    return <div className="h-[120px] text-xs text-gray-400">Sem dados</div>
  }
  const width = 320
  const height = 120
  const max = Math.max(...values, 1) * 1.1
  const step = values.length > 1 ? width / (values.length - 1) : width
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
  if (values.length === 0) {
    return <div className="h-[120px] text-xs text-gray-400">Sem dados</div>
  }
  const max = Math.max(...values, 1)
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
  if (total === 0) {
    return <div className="text-xs text-gray-400">Sem dados</div>
  }
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const segmentsWithGeometry = segments.reduce<
    {
      seg: { label: string; value: number; color: string }
      length: number
      dasharray: string
      dashoffset: number
    }[]
  >((acc, seg) => {
    const previousOffset = acc.reduce((sum, item) => sum + item.length, 0)
    const length = (seg.value / total) * circumference
    return [
      ...acc,
      {
        seg,
        length,
        dasharray: `${length} ${circumference - length}`,
        dashoffset: -previousOffset,
      },
    ]
  }, [])
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
        {segmentsWithGeometry.map(({ seg, dasharray, dashoffset }) => {
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

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-")
  return `${m}/${y.slice(-2)}`
}

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  const distSegments = data.distribution.map((d, i) => ({
    label: d.label,
    value: d.value,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }))

  const monthsLabel = data.months.length > 0
    ? `${formatMonth(data.months[0])} → ${formatMonth(data.months[data.months.length - 1])}`
    : "Sem dados"

  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <ChartWrapper title="Receita mensal" subtitle={`Pagamentos · ${monthsLabel}`}>
        <LineChart values={data.revenueByMonth} color="#3B82F6" />
      </ChartWrapper>
      <ChartWrapper title="Crescimento de alunos" subtitle={`Matrículas · ${monthsLabel}`}>
        <LineChart values={data.studentsByMonth} color="#10B981" />
      </ChartWrapper>
      <ChartWrapper title="Conversão checkout" subtitle="% por mês">
        <BarChart
          values={data.conversionByMonth}
          color="linear-gradient(180deg, #6366F1, #3B82F6)"
        />
      </ChartWrapper>
      <ChartWrapper title="Distribuição revendedores" subtitle="Por valor de plano">
        <DonutChart segments={distSegments} />
      </ChartWrapper>
      <ChartWrapper title="Origem dos alunos" subtitle="Indisponível">
        <div className="flex h-[120px] items-center justify-center text-xs text-gray-400">
          Aguardando integração de tracking
        </div>
      </ChartWrapper>
      <ChartWrapper title="Satisfação (NPS)" subtitle="Indisponível">
        <div className="flex h-[120px] items-center justify-center text-xs text-gray-400">
          Aguardando integração de pesquisa
        </div>
      </ChartWrapper>
    </div>
  )
}
