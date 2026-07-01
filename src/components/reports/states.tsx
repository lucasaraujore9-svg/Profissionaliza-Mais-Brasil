import { cn } from "@/lib/utils"

/** Skeleton de um card de gráfico (altura casa com a do gráfico → sem CLS). */
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-gray-100" />
      <div
        className="mt-4 w-full animate-pulse rounded-lg bg-gray-100"
        style={{ height }}
      />
    </div>
  )
}

/** Grade de skeletons de KPI. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
          <div className="mt-3 h-6 w-28 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-3 w-16 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton de página inteira do hub (KPIs + 2 charts). */
export function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <KpiSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  )
}

/** Estado vazio genérico dentro de um card. */
export function EmptyState({
  label = "Sem dados no período",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[120px] items-center justify-center text-sm text-gray-400",
        className,
      )}
    >
      {label}
    </div>
  )
}
