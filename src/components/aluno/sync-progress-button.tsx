"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, RefreshCw } from "lucide-react"

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done" }
  | { kind: "error"; message: string }

/**
 * "Atualizar progresso": o aluno puxa da plataforma de aulas na hora, sem
 * esperar o próximo sync automático.
 *
 * O progresso exibido aqui é uma CÓPIA (a plataforma legada não tem webhook; o
 * LMS entrega por delta horário). Quem acabou de terminar uma aula via a tela
 * discordar do que tinha acabado de fazer — e, como a emissão do certificado é
 * gateada pelo progresso, ficava esperando o cron para poder emitir.
 */
export function SyncProgressButton() {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: "idle" })

  async function handleClick() {
    setState({ kind: "loading" })
    try {
      const res = await fetch("/api/aluno/progresso/sincronizar", {
        method: "POST",
      })
      if (res.status === 429) {
        setState({
          kind: "error",
          message: "Você atualizou há pouco. Tente de novo em alguns minutos.",
        })
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null
        setState({
          kind: "error",
          message:
            data?.error ?? "Não foi possível atualizar agora. Tente novamente.",
        })
        return
      }
      // Recarrega os dados do servidor: é a página que mostra o progresso novo.
      router.refresh()
      setState({ kind: "done" })
    } catch {
      setState({
        kind: "error",
        message: "Falha de conexão. Tente novamente.",
      })
    }
  }

  const loading = state.kind === "loading"

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-[rgba(2,89,24,0.18)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-pmb-green-900)] shadow-sm transition-colors hover:bg-[var(--color-pmb-lime-50)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state.kind === "done" ? (
          <Check className="h-4 w-4 text-[var(--color-pmb-green)]" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        {loading ? "Atualizando…" : "Atualizar progresso"}
      </button>

      {/* aria-live: o resultado do clique some da tela sem isto para quem usa
          leitor de tela — o que muda é a lista de cursos, mais acima. */}
      <p aria-live="polite" className="min-h-4 text-[11px]">
        {state.kind === "done" && (
          <span className="text-[var(--color-pmb-green)]">
            Progresso atualizado.
          </span>
        )}
        {state.kind === "error" && (
          <span className="text-rose-600">{state.message}</span>
        )}
      </p>
    </div>
  )
}
