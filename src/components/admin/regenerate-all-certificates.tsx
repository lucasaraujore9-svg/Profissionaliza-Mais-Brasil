"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"

interface Result {
  total: number
  regenerated: number
  failed: number
}

interface PageResponse {
  count: number
  regenerated: number
  failed: number
  nextAfterId: string | null
}

// PERF-006: cada request regenera no máximo PAGE_SIZE (200) certificados e
// devolve `nextAfterId`. O botão itera as páginas até `nextAfterId = null`,
// acumulando os totais — a UX de "regenerar todos" continua num clique só, mas
// cada request é limitado (não estoura o timeout do servidor).
async function regenerateAllPages(): Promise<Result> {
  let afterId: string | null = null
  const totals: Result = { total: 0, regenerated: 0, failed: 0 }
  // Guarda-limite defensivo contra loop infinito (200 * 500 = 100k certificados).
  for (let guard = 0; guard < 500; guard++) {
    const qs = afterId ? `?afterId=${encodeURIComponent(afterId)}` : ""
    const res = await fetch(`/api/admin/certificates/regenerate-all${qs}`, {
      method: "POST",
    })
    const data = (await res.json()) as PageResponse & { error?: string }
    if (!res.ok) {
      throw new Error(data?.error ?? "Falha ao regenerar")
    }
    totals.total += data.count
    totals.regenerated += data.regenerated
    totals.failed += data.failed
    if (!data.nextAfterId) break
    afterId = data.nextAfterId
  }
  return totals
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
      setResult(await regenerateAllPages())
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
