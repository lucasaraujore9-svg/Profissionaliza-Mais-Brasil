"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { renderReportIcon } from "./icons"

export interface ReportTabDef {
  id: string
  label: string
  /** Nome de ícone lucide (registro em ./icons). */
  icon?: string
}

/**
 * Shell do hub de BI: cabeçalho + barra de abas (Link entre rotas `[tab]`,
 * preservando a query string dos filtros) + slot de filtros/ações + conteúdo.
 * Presentation-only.
 */
export function ReportShell({
  title,
  description,
  basePath,
  tabs,
  activeTab,
  queryString,
  filters,
  actions,
  children,
}: {
  title: string
  description?: string
  /** Ex.: "/admin/relatorios" ou "/painel/relatorios". */
  basePath: string
  tabs: ReportTabDef[]
  activeTab: string
  /** Query string atual (sem "?") para manter filtros ao trocar de aba. */
  queryString?: string
  filters?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const qs = queryString ? `?${queryString}` : ""
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div className="-mx-1 overflow-x-auto">
        <nav className="flex min-w-max gap-1 border-b border-gray-200 px-1">
          {tabs.map((tab) => {
            const active = tab.id === activeTab
            return (
              <Link
                key={tab.id}
                href={`${basePath}/${tab.id}${qs}`}
                scroll={false}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-[var(--color-pmb-green)] text-[var(--color-pmb-green-900)]"
                    : "border-transparent text-gray-500 hover:text-gray-800",
                )}
              >
                {renderReportIcon(tab.icon, "h-4 w-4")}
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {filters && (
        <div className="flex flex-wrap items-center justify-between gap-3">{filters}</div>
      )}

      <div>{children}</div>
    </div>
  )
}
