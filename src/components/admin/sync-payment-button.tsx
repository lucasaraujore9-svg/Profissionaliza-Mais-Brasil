"use client"

import { useState } from "react"
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react"

interface Props {
  enrollmentId: string
}

type State = "idle" | "loading" | "fulfilled" | "pending" | "error"

export function SyncPaymentButton({ enrollmentId }: Props) {
  const [state, setState] = useState<State>("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function handleSync() {
    setState("loading")
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/vendas/${enrollmentId}/sync-payment`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        setState("error")
        setMessage(json.error ?? "Erro desconhecido")
        return
      }
      if (json.data?.fulfilled) {
        setState("fulfilled")
        setMessage("Matrícula ativada! Recarregue a página.")
      } else {
        setState("pending")
        setMessage(json.data?.message ?? `Status Asaas: ${json.data?.asaasStatus}`)
      }
    } catch {
      setState("error")
      setMessage("Falha na requisição")
    }
  }

  if (state === "fulfilled") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <CheckCircle className="h-3.5 w-3.5" />
        Ativada
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-0.5">
      <button
        onClick={handleSync}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${state === "loading" ? "animate-spin" : ""}`} />
        {state === "loading" ? "Verificando…" : "Verificar"}
      </button>
      {message && (
        <span className={`text-[11px] ${state === "error" ? "text-red-500" : "text-muted-foreground"}`}>
          {state === "error" && <AlertCircle className="inline h-3 w-3 mr-0.5" />}
          {message}
        </span>
      )}
    </span>
  )
}
