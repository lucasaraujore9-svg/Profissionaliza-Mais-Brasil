"use client"

import { useEffect } from "react"
import { clientLogger } from "@/lib/logger-client"

export default function PainelError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    clientLogger.error(
      { err: String(error), digest: error.digest, event: "painel.error_boundary", segment: "painel" },
      "painel route error",
    )
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground">
        Erro no painel
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Algo deu errado ao carregar essa seção. Tente novamente — se persistir,
        contate o suporte.
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
