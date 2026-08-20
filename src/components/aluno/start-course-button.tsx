"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PlayCircle } from "lucide-react"

/**
 * "Começar" um curso do plano assinado.
 *
 * A matrícula não existe antes deste clique — o provisionamento é sob demanda.
 * Por isso o botão trava enquanto provisiona (fala com a fornecedora) e trata
 * 409 como "espere e recarregue", não como erro: 409 significa que outra
 * chamada está criando a MESMA matrícula (duplo clique).
 */
export function StartCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/aluno/assinatura/curso/${courseId}/liberar`,
        { method: "POST" },
      )
      const body = await res.json().catch(() => ({}))

      if (res.status === 409) {
        // Já está sendo liberado agora: recarregar mostra o card pronto.
        router.refresh()
        return
      }
      if (!res.ok) {
        setError(body.error ?? "Não foi possível liberar o curso")
        return
      }
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Liberando…
          </>
        ) : (
          <>
            <PlayCircle className="h-3.5 w-3.5" />
            Começar
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
