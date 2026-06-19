"use client"

import { useState } from "react"
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MultiSyncResult } from "@/lib/catalog/sync-all"

interface CatalogSyncButtonProps {
  onDone?: () => void
}

const PROVIDER_LABEL: Record<string, string> = {
  EA: "Escola Avançada",
  LMS: "LMS",
}

export function CatalogSyncButton({ onDone }: CatalogSyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MultiSyncResult | null>(null)

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
      setResult(body.data as MultiSyncResult)
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
        <div className="flex flex-col items-end gap-0.5 text-xs">
          <span className="flex items-center gap-1 font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />+{result.added} adicionados · ~
            {result.updated} atualizados · {result.totalInEa} no catálogo
          </span>
          {/* Quebra por plataforma (só as que rodaram com sucesso). */}
          {result.byProvider
            .filter((p) => p.ok)
            .map((p) => (
              <span key={p.provider} className="text-gray-500">
                {PROVIDER_LABEL[p.provider] ?? p.provider}: +{p.added} · ~{p.updated}
              </span>
            ))}
          {/* Falha parcial: uma plataforma falhou mas a outra sincronizou. */}
          {result.errors.map((e) => (
            <span key={e.provider} className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {PROVIDER_LABEL[e.provider] ?? e.provider} falhou: {e.message}
            </span>
          ))}
        </div>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  )
}
