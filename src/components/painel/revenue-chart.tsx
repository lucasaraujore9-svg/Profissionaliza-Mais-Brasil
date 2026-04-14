const dataPoints = [
  1200, 1450, 1100, 1800, 2100, 1950, 2400, 2200, 2800, 2600, 3100, 2900, 3400,
  3200, 3800, 3600, 4100, 3900, 4400, 4200, 4800, 4600, 5100, 4900, 5400, 5200,
  5700, 5500, 6000, 5800,
] as const

export function RevenueChart() {
  const max = Math.max(...dataPoints)
  const min = Math.min(...dataPoints)
  const range = max - min

  const points = dataPoints
    .map((value, index) => {
      const x = (index / (dataPoints.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(" ")

  const areaPath = `M 0,100 L ${points} L 100,100 Z`

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">
            Receita dos últimos 30 dias
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Acumulado no período:{" "}
            <span className="font-mono font-semibold text-[#1A1A2E]">
              R$ 48.720
            </span>
          </p>
        </div>
        <select className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
          <option>Últimos 30 dias</option>
          <option>Últimos 7 dias</option>
          <option>Últimos 90 dias</option>
        </select>
      </div>

      <div className="mt-6 h-52 w-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          <defs>
            <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#areaFill)" />
          <polyline
            points={points}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-gray-400">
        <span>01/04</span>
        <span>08/04</span>
        <span>15/04</span>
        <span>22/04</span>
        <span>30/04</span>
      </div>
    </div>
  )
}
