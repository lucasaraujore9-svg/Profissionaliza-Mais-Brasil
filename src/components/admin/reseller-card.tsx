import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface ResellerCardProps {
  title?: string
  icon?: LucideIcon
  description?: string
  /** Acoes no canto superior direito do cabecalho. */
  headerAction?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Sem padding interno (para conteudo de tabela que ja tem o seu). */
  flush?: boolean
}

/**
 * Shell de card padrao da area de revendas. Substitui as ~15 copias soltas de
 * `rounded-2xl border border-gray-200 bg-white p-6 shadow-sm` e padroniza a
 * escala do cabecalho (um unico tamanho de titulo).
 */
export function ResellerCard({
  title,
  icon: Icon,
  description,
  headerAction,
  children,
  className,
  flush = false,
}: ResellerCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white shadow-sm",
        flush ? "" : "p-6",
        className,
      )}
    >
      {title && (
        <div
          className={cn(
            "flex items-start justify-between gap-3",
            flush && "border-b border-gray-200 px-6 py-4",
          )}
        >
          <div>
            <div className="flex items-center gap-2">
              {Icon && (
                <Icon className="h-4 w-4 text-[var(--color-pmb-green)]" />
              )}
              <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                {title}
              </h3>
            </div>
            {description && (
              <p className="mt-1 text-xs text-gray-500">{description}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
