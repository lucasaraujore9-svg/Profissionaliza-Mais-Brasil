"use client"

import { useEffect } from "react"
import Link from "next/link"
import { clientLogger } from "@/lib/logger-client"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AppError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // O Vercel/Next captura o stack em logs de runtime. Logger client
    // estruturado para inspecao em dev/staging sem expor stack ao usuario.
    clientLogger.error(
      { err: String(error), digest: error.digest, event: "app_error.boundary" },
      "app error boundary",
    )
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-pmb-mist)] px-6 py-16 text-center">
      <p className="text-5xl font-black text-[var(--color-pmb-green)]">!</p>
      <h1 className="mt-4 max-w-xl text-2xl font-bold text-[var(--color-pmb-green-900)] md:text-3xl">
        Algo deu errado do nosso lado
      </h1>
      <p className="mt-3 max-w-xl text-sm text-[rgba(2,89,24,0.7)]">
        Já fomos notificados e estamos olhando. Se quiser, tente carregar a
        página novamente ou volte para a home.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-[rgba(2,89,24,0.5)]">
          Código do incidente: {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--color-pmb-green)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-lg border border-[rgba(2,89,24,0.2)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-pmb-green)]"
        >
          Voltar para a home
        </Link>
      </div>
    </div>
  )
}
