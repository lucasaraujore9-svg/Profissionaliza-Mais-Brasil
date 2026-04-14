"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

const filters = ["Todos", "Ativos", "Ocultos"] as const

export function CourseListToolbar() {
  const [active, setActive] = useState<(typeof filters)[number]>("Todos")

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 md:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar curso por título..."
          className="pl-9"
          type="search"
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActive(filter)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              active === filter
                ? "bg-white text-[#1A1A2E] shadow-sm"
                : "text-gray-600 hover:text-[#1A1A2E]"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  )
}
