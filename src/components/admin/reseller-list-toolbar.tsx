"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

const FILTERS = ["Todos", "Ativos", "Pendentes", "Suspensos"] as const

export function ResellerListToolbar() {
  const [active, setActive] = useState<(typeof FILTERS)[number]>("Todos")

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar por nome ou e-mail"
          className="pl-9"
        />
      </div>
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              active === f
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-[#1A1A2E]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  )
}
