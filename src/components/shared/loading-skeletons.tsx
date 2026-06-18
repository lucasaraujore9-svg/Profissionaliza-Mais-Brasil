import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Skeletons de carregamento reutilizaveis (admin + painel). Substituem os
 * placeholders de texto ("Carregando...") por blocos que preservam o layout,
 * evitando salto de altura e o flash de "R$ 0" / "0 itens" como dado real.
 */

/** Linhas de tabela em shimmer. */
export function TableRowsSkeleton({
  rows = 6,
  cols = 4,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={cn("divide-y divide-gray-100", className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-6 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-4", c === 0 ? "w-1/3" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Grade de cards de KPI/resumo em shimmer. */
export function StatCardsSkeleton({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
        </div>
      ))}
    </div>
  )
}

/** Bloco generico (chart, painel) em shimmer. */
export function BlockSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        "h-48 w-full rounded-2xl border border-gray-200 bg-gray-100",
        className,
      )}
    />
  )
}
