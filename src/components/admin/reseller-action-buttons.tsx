"use client"

import { useState } from "react"
import { Pause, Play, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ResellerStatus } from "./reseller-table"

interface ResellerActionButtonsProps {
  tenantId: string
  status: ResellerStatus
  onChanged?: () => void
}

export function ResellerActionButtons({
  tenantId,
  status,
  onChanged,
}: ResellerActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(next: ResellerStatus) {
    setLoading(next)
    setError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao atualizar status")
        return
      }
      onChanged?.()
    } catch {
      setError("Erro de rede ao atualizar status")
    } finally {
      setLoading(null)
    }
  }

  async function cancel() {
    if (!confirm("Tem certeza que deseja cancelar a assinatura deste revendedor?")) return
    setLoading("CANCEL")
    setError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}`, {
        method: "DELETE",
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao cancelar assinatura")
        return
      }
      onChanged?.()
    } catch {
      setError("Erro de rede ao cancelar assinatura")
    } finally {
      setLoading(null)
    }
  }

  const isCancelled = status === "CANCELLED"

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Ações</h3>
      <p className="mt-1 text-xs text-gray-600">
        Operações administrativas que afetam o status da assinatura.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1"
          disabled={isCancelled || loading !== null || status === "SUSPENDED"}
          onClick={() => setStatus("SUSPENDED")}
        >
          <Pause className="mr-2 h-4 w-4" />
          {loading === "SUSPENDED" ? "Aguarde..." : "Suspender"}
        </Button>
        <Button
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={isCancelled || loading !== null || status === "ACTIVE"}
          onClick={() => setStatus("ACTIVE")}
        >
          <Play className="mr-2 h-4 w-4" />
          {loading === "ACTIVE" ? "Aguarde..." : "Ativar"}
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
          disabled={isCancelled || loading !== null}
          onClick={cancel}
        >
          <Ban className="mr-2 h-4 w-4" />
          {loading === "CANCEL" ? "Cancelando..." : "Cancelar assinatura"}
        </Button>
      </div>
    </div>
  )
}
