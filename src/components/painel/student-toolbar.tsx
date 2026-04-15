"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

export type StudentFilter = "TODOS" | "ATIVO" | "BLOQUEADO" | "INATIVO"

const filters: { key: StudentFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "ATIVO", label: "Ativos" },
  { key: "BLOQUEADO", label: "Bloqueados" },
  { key: "INATIVO", label: "Inativos" },
]

interface StudentToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  filter: StudentFilter
  onFilterChange: (filter: StudentFilter) => void
}

export function StudentToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: StudentToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 md:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar por nome ou email..."
          className="pl-9"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onFilterChange(item.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === item.key
                ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
