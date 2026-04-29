"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"

interface Props {
  tenantId: string
}

export function ResellerImpersonateButton({ tenantId }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/impersonate`,
        { method: "POST" },
      )
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao acessar como revendedor")
        return
      }
      window.location.href = body.data?.redirect ?? "/painel"
    } catch {
      setError("Erro de rede")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Acessar painel como revendedor
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Abre o painel do revendedor com sessão dele. Edições afetam dados
            reais. Você pode voltar pra admin a qualquer momento.
          </p>
        </div>
        <button
          onClick={handle}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pmb-green)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60 whitespace-nowrap"
        >
          <LogIn className="h-3.5 w-3.5" />
          {busy ? "Acessando..." : "Acessar painel"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  )
}
