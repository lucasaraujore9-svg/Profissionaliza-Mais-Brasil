"use client"

import { useState } from "react"
import { Trash2, AlertTriangle } from "lucide-react"

const CONFIRM_PHRASE = "EXCLUIR MINHA CONTA"

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setError(null)
    if (confirm.trim() !== CONFIRM_PHRASE) {
      setError(`Digite exatamente: ${CONFIRM_PHRASE}`)
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/aluno/conta", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Falha ao excluir a conta")
        return
      }
      // Dados anonimizados — encerra a sessão.
      window.location.href = "/logout"
    } catch {
      setError("Erro de rede ao excluir a conta")
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
            Em conformidade com a LGPD, seus dados pessoais (nome, e-mail, CPF,
            telefone e endereço) serão removidos e o acesso será encerrado.
            Registros financeiros são mantidos de forma anonimizada por obrigação
            legal. Esta ação é irreversível.
          </p>
        </div>
      </div>

      {!open ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setError(null)
            }}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Excluir minha conta
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="flex items-start gap-2 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Para confirmar, digite{" "}
              <strong className="font-mono">{CONFIRM_PHRASE}</strong> no campo
              abaixo.
            </span>
          </p>
          <label className="mt-3 block">
            <span className="sr-only">Confirmação de exclusão de conta</span>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-label={`Digite ${CONFIRM_PHRASE} para confirmar`}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy || confirm.trim() !== CONFIRM_PHRASE}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Excluindo..." : "Confirmar exclusão"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setConfirm("")
                setError(null)
              }}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
