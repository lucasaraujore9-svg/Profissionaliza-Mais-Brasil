"use client"

import { useEffect } from "react"
import { clientLogger } from "@/lib/logger-client"

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    clientLogger.error(
      { err: String(error), digest: error.digest, event: "global_error.boundary" },
      "global error boundary",
    )
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#f3f6f1",
          color: "#0a2415",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>
          Algo deu errado
        </h1>
        <p style={{ marginTop: "0.75rem", color: "#3a4a3f", maxWidth: 480 }}>
          O servidor encontrou um problema ao carregar a página. Já fomos
          notificados.
        </p>
        {error.digest && (
          <p style={{ marginTop: "0.5rem", color: "#6b7972", fontSize: 12 }}>
            Código: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            padding: "0.625rem 1.25rem",
            background: "#025918",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  )
}
