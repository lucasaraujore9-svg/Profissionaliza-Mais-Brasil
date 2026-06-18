"use client"

import { useState } from "react"
import { Trash2, AlertTriangle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function DeleteAccountRequest() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleRequest() {
    setError(null)
    setSuccess(null)
    setConfirmOpen(false)

    setBusy(true)
    try {
      const res = await fetch("/api/painel/config/excluir-conta", {
        method: "POST",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Falha ao solicitar a exclusão da conta")
        return
      }
      setSuccess(
        body.data?.message ?? "Solicitação de exclusão registrada com sucesso.",
      )
    } catch {
      setError("Erro de rede ao solicitar a exclusão da conta")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <Trash2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-red-700">Excluir minha conta</h2>
          <p className="mt-0.5 text-xs text-gray-600">
            Em conformidade com a LGPD, seus dados pessoais serão anonimizados e o
            acesso será encerrado. Registros financeiros são mantidos por obrigação
            legal. A solicitação será registrada para análise da nossa equipe.
          </p>
        </div>
      </div>

      {success ? (
        <p
          role="status"
          className="mt-5 rounded-md bg-green-100 px-3 py-2 text-xs text-green-800"
        >
          {success}
        </p>
      ) : (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "Solicitando..." : "Solicitar exclusão da conta"}
          </button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir minha conta</AlertDialogTitle>
                <AlertDialogDescription>
                  Vamos iniciar a exclusão dos seus dados pessoais (LGPD). Seus
                  dados serão anonimizados e o acesso encerrado. Esta ação não
                  pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault()
                    handleRequest()
                  }}
                >
                  Solicitar exclusão
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md bg-red-100 px-3 py-2 text-xs text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
