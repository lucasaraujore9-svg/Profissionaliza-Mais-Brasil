"use client"

import { useEffect } from "react"

/**
 * Error boundary específico do segmento /admin.
 *
 * Captura erros lançados em qualquer rota filha (admin/*). Sem este
 * arquivo, o usuário cai no error.tsx raiz que mostra mensagem genérica
 * sem contexto administrativo.
 *
 * O Next.js re-renderiza este componente passando `error` e `reset()`.
 * `reset()` tenta re-renderizar o segmento (pode resolver erros transientes).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[admin/error] route error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground">
        Erro na área administrativa
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Algo deu errado ao carregar essa seção. A equipe foi notificada.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">
          ID do erro: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Tentar novamente
      </button>
    </div>
  )
}
