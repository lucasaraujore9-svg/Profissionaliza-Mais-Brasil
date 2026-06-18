"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type Ledger = "LEGACY" | "MONTHLY"
type Action = "CANCEL" | "DISMISS"

/**
 * Botoes para resolver um clawback pendente de uma comissao (legado ou mensal).
 * CANCEL reverte a comissao (vira CANCELLED); DISMISS mantem e apenas destrava os
 * payouts do indicador. Em ambos, a marca [CLAWBACK_PENDING] deixa de existir.
 */
export function ClawbackResolver({
  ledger,
  id,
}: {
  ledger: Ledger
  id: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Action | null>(null)

  async function resolve(action: Action) {
    if (busy) return
    if (
      action === "CANCEL" &&
      !window.confirm(
        "Cancelar a comissao? Ela sai dos totais e nao sera paga. Use quando o estorno procede.",
      )
    ) {
      return
    }
    setBusy(action)
    try {
      const res = await fetch("/api/admin/referrals/clawback/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger, id, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error ?? "Falha ao resolver clawback")
      }
      toast.success(
        action === "CANCEL"
          ? "Comissao cancelada — payouts do indicador destravados."
          : "Clawback dispensado — payouts do indicador destravados.",
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resolver")
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={busy !== null}
        onClick={() => resolve("CANCEL")}
      >
        {busy === "CANCEL" ? "Cancelando…" : "Cancelar comissão"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() => resolve("DISMISS")}
      >
        {busy === "DISMISS" ? "Mantendo…" : "Manter e destravar"}
      </Button>
    </div>
  )
}
