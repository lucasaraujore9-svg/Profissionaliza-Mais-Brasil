"use client"

import { useState } from "react"
import { Eye, X } from "lucide-react"
import { roleLabel, type PainelMemberRole } from "@/lib/auth/painel-permissions"

/**
 * Banner da prévia "ver como" — o dono está inspecionando o painel com as
 * permissões de um papel da equipe. Diferente da impersonação de admin, aqui a
 * sessão continua sendo a do dono e o contexto é SOMENTE LEITURA, então nada do
 * que ele fizer nesse modo escreve no banco.
 */
export function PainelPreviewBanner({ role }: { role: PainelMemberRole }) {
  const [busy, setBusy] = useState(false)

  const handleExit = async () => {
    setBusy(true)
    try {
      await fetch("/api/painel/equipe/preview", { method: "DELETE" })
    } finally {
      window.location.href = "/painel/equipe"
    }
  }

  return (
    <div className="border-b border-sky-300 bg-sky-50 px-4 py-2.5 text-sky-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 shrink-0" />
          <p>
            Você está vendo o painel como <strong>{roleLabel(role)}</strong>.
            Modo somente leitura — nenhuma alteração é salva.
          </p>
        </div>
        <button
          onClick={handleExit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
        >
          <X className="h-3.5 w-3.5" />
          {busy ? "Saindo..." : "Sair da prévia"}
        </button>
      </div>
    </div>
  )
}
