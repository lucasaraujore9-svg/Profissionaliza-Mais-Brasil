import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Estado vazio padrao do app (admin + painel). Use em listas/tabelas sem dados
 * em vez de uma linha de texto cinza solta.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-600">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
