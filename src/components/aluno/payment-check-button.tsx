"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react"

type Result = "confirmed" | "pending" | "unsupported"

interface Props {
  enrollmentId: string
}

/**
 * Botão "Já fiz o pagamento": dispara a reconciliação no gateway. Se o
 * pagamento estiver aprovado, mostra confirmação e atualiza a página (a
 * matrícula sai de "em aberto"). Caso contrário, pede para aguardar.
 */
export function PaymentCheckButton({ enrollmentId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function check() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch("/api/aluno/pagamentos/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId }),
      })
      const body = await res.json().catch(() => null)
      const status: Result = body?.data?.status ?? "pending"
      setResult(status)
      if (status === "confirmed") {
        // Dá um instante para o aluno ver a confirmação e recarrega os dados.
        setTimeout(() => router.refresh(), 1600)
      }
    } catch {
      setResult("pending")
    } finally {
      setLoading(false)
    }
  }

  // Confirmado: mensagem positiva (substitui o botão).
  if (result === "confirmed") {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-4 w-4" />
        Pagamento confirmado! Liberando acesso…
      </span>
    )
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={check}
        disabled={loading}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-green)]/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando…
          </>
        ) : result ? (
          <>
            <RefreshCw className="h-4 w-4" />
            Verificar novamente
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Já fiz o pagamento
          </>
        )}
      </button>

      {(result === "pending" || result === "unsupported") && !loading && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 sm:max-w-[16rem] sm:text-right">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {result === "pending"
              ? "Ainda não identificamos seu pagamento. Se você acabou de pagar, aguarde alguns minutos e verifique de novo."
              : "Assim que o pagamento for processado, seu acesso é liberado automaticamente."}
          </span>
        </p>
      )}
    </div>
  )
}
