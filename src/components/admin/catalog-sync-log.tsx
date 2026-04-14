"use client"

import { useState } from "react"
import { ChevronDown, CheckCircle2, XCircle } from "lucide-react"

const LOGS = [
  { id: "s01", data: "08/04/2026 14:22", status: "sucesso" as const, added: 2, updated: 12, msg: "Sync manual via admin" },
  { id: "s02", data: "08/04/2026 08:00", status: "sucesso" as const, added: 0, updated: 8, msg: "Sync automática (cron)" },
  { id: "s03", data: "07/04/2026 08:00", status: "sucesso" as const, added: 1, updated: 14, msg: "Sync automática (cron)" },
  { id: "s04", data: "06/04/2026 08:00", status: "falha" as const, added: 0, updated: 0, msg: "Timeout API EA · retentado com sucesso 08:05" },
  { id: "s05", data: "05/04/2026 08:00", status: "sucesso" as const, added: 3, updated: 10, msg: "Sync automática (cron)" },
]

export function CatalogSyncLog() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Histórico de sincronizações</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Últimas 5 execuções com status e alterações aplicadas.
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Adicionados</th>
                <th className="px-6 py-3 font-medium">Atualizados</th>
                <th className="px-6 py-3 font-medium">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {LOGS.map((log) => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">{log.data}</td>
                  <td className="px-6 py-3">
                    {log.status === "sucesso" ? (
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
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">+{log.added}</td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">~{log.updated}</td>
                  <td className="px-6 py-3 text-xs text-gray-600">{log.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
