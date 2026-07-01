"use client"

import { Download } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Botão de exportação CSV. Modo preferido: `href` para uma rota GET que reusa
 * `csvResponse` no servidor (aplica o mesmo escaping/anti-injection). Modo
 * fallback: `onExport` gera o CSV no cliente a partir de dados já em memória.
 */
export function ExportButton({
  href,
  onExport,
  label = "Exportar CSV",
  disabled,
  className,
}: {
  href?: string
  onExport?: () => void
  label?: string
  disabled?: boolean
  className?: string
}) {
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50",
    className,
  )

  if (href && !disabled) {
    return (
      <Link href={href} prefetch={false} className={base}>
        <Download className="h-3.5 w-3.5" />
        {label}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onExport} disabled={disabled} className={base}>
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
