import { Clock } from "lucide-react"
import { CatalogSyncButton } from "./catalog-sync-button"

export function CatalogHeader() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A2E]">Catálogo agregado</h2>
        <p className="mt-1 flex items-center gap-2 text-xs text-gray-600">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          Última sincronização: 08/04/2026 às 14:22 · 42 cursos · 0 falhas
        </p>
      </div>
      <CatalogSyncButton />
    </div>
  )
}
