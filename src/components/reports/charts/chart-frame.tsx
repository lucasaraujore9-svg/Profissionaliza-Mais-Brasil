import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { EmptyState } from "../states"

/**
 * Card server-safe que envolve todos os gráficos (título/subtítulo/ações/altura
 * fixa/estados de vazio e erro). NÃO importa Recharts, então pode renderizar o
 * shell e o fallback sem puxar o bundle de charts.
 */
export interface ChartFrameProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  height?: number
  isEmpty?: boolean
  emptyLabel?: string
  error?: string | null
  className?: string
  children?: ReactNode
}

export function ChartFrame({
  title,
  subtitle,
  actions,
  height = 260,
  isEmpty,
  emptyLabel,
  error,
  className,
  children,
}: ChartFrameProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-600">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="mt-4" style={{ height }}>
        {error ? (
          <EmptyState label={error} className="text-red-500" />
        ) : isEmpty ? (
          <EmptyState label={emptyLabel} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}
