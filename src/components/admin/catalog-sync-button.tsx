"use client"

import { useState } from "react"
import { RefreshCw, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SyncResult } from "@/lib/catalog/sync"

interface CatalogSyncButtonProps {
  onDone?: () => void
}

export function CatalogSyncButton({ onDone }: CatalogSyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  const handle = async () => {
    setSyncing(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/catalogo/sync", { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao sincronizar")
        return
      }
      setResult(body.data as SyncResult)
      onDone?.()
    } catch {
      setError("Erro de rede ao sincronizar")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={handle}
        disabled={syncing}
        className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Sincronizando..." : "Sincronizar catálogo"}
      </Button>
      {result && (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          +{result.added} adicionados · ~{result.updated} atualizados · {result.totalInEa} na EA
        </span>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  )
}
