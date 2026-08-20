"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Cancelamento pedido pelo próprio aluno.
 *
 * A página de planos promete "cancele quando quiser" e até aqui não havia por
 * onde — só o suporte, à mão, no Asaas. O acesso NÃO cai na hora: o mês
 * corrente já foi pago, então a recorrência para e o acesso segue até o fim do
 * ciclo. O texto diz isso antes de confirmar.
 */
export function CancelSubscriptionButton({
  accessUntilLabel,
}: {
  accessUntilLabel: string | null
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/aluno/assinatura", { method: "DELETE" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Não foi possível cancelar")
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-gray-500 underline hover:text-gray-700"
      >
        Cancelar assinatura
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-800">
        Cancelar sua assinatura?
      </p>
      <p className="mt-1 text-xs text-gray-600">
        A cobrança mensal para imediatamente.{" "}
        {accessUntilLabel
          ? `Você continua com acesso aos cursos até ${accessUntilLabel}.`
          : "Seu acesso segue até o fim do período já pago."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Sim, cancelar
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
        >
          Manter assinatura
        </button>
      </div>
    </div>
  )
}
