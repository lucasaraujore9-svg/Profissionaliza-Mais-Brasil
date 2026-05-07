"use client"

import { useState } from "react"
import { ChevronDown, CheckCircle2, XCircle } from "lucide-react"
import type { SyncLogEntry } from "@/lib/catalog/sync-log"

interface CatalogSyncLogProps {
  logs: SyncLogEntry[]
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR")
  } catch {
    return iso
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function CatalogSyncLog({ logs }: CatalogSyncLogProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Histórico de sincronizações</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            {logs.length === 0
              ? "Histórico detalhado requer Redis (Upstash). Configure UPSTASH_REDIS_REST_URL para habilitar."
              : `Últimas ${logs.length} execuções com status e alterações aplicadas.`}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && logs.length > 0 && (
        <div className="overflow-x-auto border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Origem</th>
                <th className="px-6 py-3 font-medium">Adicionados</th>
                <th className="px-6 py-3 font-medium">Atualizados</th>
                <th className="px-6 py-3 font-medium">Duração</th>
                <th className="px-6 py-3 font-medium">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">
                    {formatDate(log.at)}
                  </td>
                  <td className="px-6 py-3">
                    {log.status === "SUCCESS" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Sucesso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                        <XCircle className="h-3.5 w-3.5" />
                        Falha
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-600">
                    {log.source === "manual" ? "Manual" : "Cron"}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">+{log.added}</td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">~{log.updated}</td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">
                    {formatDuration(log.durationMs)}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-600">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
