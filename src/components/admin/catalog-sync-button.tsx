"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CatalogSyncButtonProps {
  onDone?: () => void
}

export function CatalogSyncButton({ onDone }: CatalogSyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/catalogo/sync", { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao sincronizar")
        return
      }
      onDone?.()
    } catch {
      setError("Erro de rede ao sincronizar")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={handle}
        disabled={syncing}
        className="bg-blue-600 text-white hover:bg-blue-700"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Sincronizando..." : "Sincronizar com Escola Avançada"}
      </Button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  )
}
