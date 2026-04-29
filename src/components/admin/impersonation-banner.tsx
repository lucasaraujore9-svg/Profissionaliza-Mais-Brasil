"use client"

import { useState } from "react"
import { ArrowLeft, AlertCircle } from "lucide-react"

interface ImpersonationBannerProps {
  adminName: string
  targetName: string
}

export function ImpersonationBanner({
  adminName,
  targetName,
}: ImpersonationBannerProps) {
  const [busy, setBusy] = useState(false)

  const handleEnd = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/end-impersonation", { method: "POST" })
      const body = await res.json()
      if (res.ok && body.data?.redirect) {
        window.location.href = body.data.redirect
        return
      }
      window.location.href = "/login"
    } catch {
      window.location.href = "/login"
    }
  }

  return (
    <div className="border-b border-yellow-300 bg-yellow-50 px-4 py-2.5 text-yellow-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>
            <strong>{adminName}</strong> acessando como{" "}
            <strong>{targetName}</strong>. Toda alteração afeta o revendedor
            real.
          </p>
        </div>
        <button
          onClick={handleEnd}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-yellow-400 bg-white px-3 py-1.5 text-xs font-semibold text-yellow-900 hover:bg-yellow-100 disabled:opacity-60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {busy ? "Voltando..." : "Voltar para admin"}
        </button>
      </div>
    </div>
  )
}
