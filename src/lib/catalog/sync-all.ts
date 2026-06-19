import { syncCatalogFromEA, type SyncResult } from "./sync"
import { syncCatalogFromLMS } from "./sync-lms"
import { isLmsConfigured } from "@/lib/lms"
import { contextLogger } from "@/lib/logger"

export type SyncProvider = "EA" | "LMS"

export interface ProviderSyncResult extends SyncResult {
  provider: SyncProvider
  ok: boolean
  error?: string
}

export interface MultiSyncResult {
  /** Agregados (todas as plataformas que rodaram com sucesso). */
  added: number
  updated: number
  /** Mantido como `totalInEa` por compat com o front; é o total agregado. */
  totalInEa: number
  durationMs: number
  byProvider: ProviderSyncResult[]
  errors: { provider: SyncProvider; message: string }[]
}

/**
 * Sincroniza o catálogo de TODAS as fornecedoras (Escola Avançada + LMS) e
 * agrega o resultado. Tolerante a falha parcial: se uma plataforma falha, a
 * outra ainda é aplicada e o erro vai em `errors` (o caller decide o status).
 * O LMS é pulado quando não há credenciais configuradas (`isLmsConfigured`).
 */
export async function syncAllCatalogs(
  source: "manual" | "cron",
): Promise<MultiSyncResult> {
  const start = Date.now()
  const byProvider: ProviderSyncResult[] = []
  const errors: MultiSyncResult["errors"] = []

  // Cada plataforma é independente — uma falha não derruba a outra.
  const tasks: { provider: SyncProvider; run: () => Promise<SyncResult> }[] = [
    { provider: "EA", run: () => syncCatalogFromEA(source) },
  ]
  if (isLmsConfigured()) {
    tasks.push({ provider: "LMS", run: () => syncCatalogFromLMS(source) })
  }

  for (const task of tasks) {
    try {
      const r = await task.run()
      byProvider.push({ ...r, provider: task.provider, ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido"
      contextLogger().error(
        { err, event: "catalog.sync_all.provider_failed", provider: task.provider, source },
        `sync de catálogo (${task.provider}) falhou`,
      )
      errors.push({ provider: task.provider, message })
      byProvider.push({
        provider: task.provider,
        ok: false,
        error: message,
        added: 0,
        updated: 0,
        totalInEa: 0,
        durationMs: 0,
      })
    }
  }

  const added = byProvider.reduce((s, r) => s + r.added, 0)
  const updated = byProvider.reduce((s, r) => s + r.updated, 0)
  const totalInEa = byProvider.reduce((s, r) => s + r.totalInEa, 0)

  return { added, updated, totalInEa, durationMs: Date.now() - start, byProvider, errors }
}
