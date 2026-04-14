import { Clock } from "lucide-react"
import { CatalogSyncButton } from "./catalog-sync-button"

export interface CatalogLastSync {
  at: string
  totalInEa: number
  added: number
  updated: number
}

interface CatalogHeaderProps {
  lastSync: CatalogLastSync | null
  totalCourses: number
  onSynced: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR")
  } catch {
    return iso
  }
}

export function CatalogHeader({ lastSync, totalCourses, onSynced }: CatalogHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A2E]">Catálogo agregado</h2>
        <p className="mt-1 flex items-center gap-2 text-xs text-gray-600">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          {lastSync
            ? `Última sincronização: ${formatDate(lastSync.at)} · ${lastSync.totalInEa} cursos na EA · ${totalCourses} no banco`
            : `Nenhuma sincronização registrada · ${totalCourses} cursos no banco`}
        </p>
      </div>
      <CatalogSyncButton onDone={onSynced} />
    </div>
  )
}
