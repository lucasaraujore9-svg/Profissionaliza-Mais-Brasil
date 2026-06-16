"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Shuffle } from "lucide-react"

/**
 * Liga/desliga o rodízio automático de leads de revenda (B2B) entre os
 * vendedores de revenda ativos. Visível apenas para super/gerente de vendas.
 * Quando desligado, os leads nascem sem dono e a atribuição é manual no kanban.
 */
export function LeadRevendaDistributionToggle({
  initialAutoAssign,
  eligibleCount,
}: {
  initialAutoAssign: boolean
  eligibleCount: number
}) {
  const router = useRouter()
  const [autoAssign, setAutoAssign] = useState(initialAutoAssign)
  const [pending, startTransition] = useTransition()

  async function toggle() {
    const next = !autoAssign
    setAutoAssign(next) // otimista
    try {
      const res = await fetch("/api/admin/leads-revenda/distribuicao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoAssign: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao atualizar distribuição.")
        setAutoAssign(!next)
        return
      }
      toast.success(
        next
          ? "Rodízio automático ligado."
          : "Rodízio desligado — atribuição manual.",
      )
      startTransition(() => router.refresh())
    } catch {
      toast.error("Erro de conexão. Tente de novo.")
      setAutoAssign(!next)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5">
      <Shuffle className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      <span className="text-xs font-semibold text-gray-600">
        Distribuição automática
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={autoAssign}
        disabled={pending}
        onClick={toggle}
        title={
          autoAssign && eligibleCount === 0
            ? "Ligado, mas não há vendedor de revenda ativo na fila"
            : undefined
        }
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          autoAssign ? "bg-[var(--color-pmb-green)]" : "bg-gray-300"
        } disabled:opacity-60`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            autoAssign ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      {autoAssign && eligibleCount === 0 && (
        <span className="text-[10px] font-semibold text-amber-600">
          sem vendedor na fila
        </span>
      )}
    </div>
  )
}
