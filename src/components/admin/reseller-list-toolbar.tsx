"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

export type ResellerFilter = "TODOS" | "ACTIVE" | "PENDING" | "SUSPENDED"

interface ResellerListToolbarProps {
  query: string
  filter: ResellerFilter
  onQueryChange: (q: string) => void
  onFilterChange: (f: ResellerFilter) => void
}

const FILTERS: { key: ResellerFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "ACTIVE", label: "Ativos" },
  { key: "PENDING", label: "Pendentes" },
  { key: "SUSPENDED", label: "Suspensos" },
]

export function ResellerListToolbar({
  query,
  filter,
  onQueryChange,
  onFilterChange,
}: ResellerListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar por nome, slug, e-mail ou admin"
          className="pl-9"
        />
      </div>
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onFilterChange(f.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key
                ? "bg-white text-[var(--color-pmb-green)] shadow-sm"
                : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
