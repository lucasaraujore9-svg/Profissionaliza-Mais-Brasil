"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"

interface Result {
  total: number
  regenerated: number
  failed: number
}

/**
 * Botão SUPER_ADMIN para regenerar em lote os PDFs de todos os certificados já
 * emitidos, aplicando o layout atual (variáveis em maiúsculo, % de conclusão na
 * frente, QR com cartão branco, página 2). Roda no servidor via
 * POST /api/admin/certificates/regenerate-all.
 */
export function RegenerateAllCertificates() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/certificates/regenerate-all", {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? "Falha ao regenerar")
      }
      setResult(data as Result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <span className="text-sm text-gray-700">
              Confirmar? Vai sobrescrever os PDFs de todos os certificados emitidos.
            </span>
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green-900)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Regenerando…" : "Sim, regenerar todos"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-pmb-green-900)] px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green-900)] hover:bg-[var(--color-pmb-green-900)]/5"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerar todos os certificados
          </button>
        )}
      </div>

      {result && (
        <p className="text-sm text-gray-700">
          Concluído: {result.regenerated}/{result.total} regenerados
          {result.failed > 0 ? ` · ${result.failed} falha(s)` : ""}.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
