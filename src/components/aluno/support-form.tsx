"use client"

import { useState } from "react"
import { Send } from "lucide-react"

export function SupportForm() {
  const [assunto, setAssunto] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await fetch("/api/aluno/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assunto, mensagem }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ ok: false, text: body.error ?? "Falha ao enviar mensagem" })
      } else {
        setResult({
          ok: true,
          text: "Mensagem enviada. A equipe vai responder em breve.",
        })
        setAssunto("")
        setMensagem("")
      }
    } catch {
      setResult({ ok: false, text: "Erro de rede ao enviar mensagem" })
    } finally {
      setSending(false)
    }
  }

  const disabled =
    sending || assunto.trim().length < 3 || mensagem.trim().length < 10

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700">Assunto</label>
        <input
          type="text"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          maxLength={120}
          required
          placeholder="Ex.: Dúvida sobre certificado"
          className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Mensagem</label>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={5}
          maxLength={2000}
          required
          placeholder="Descreva sua dúvida ou pedido com detalhes..."
          className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
        />
        <p className="mt-1 text-[10px] text-gray-500">
          {mensagem.length}/2000 caracteres
        </p>
      </div>

      {result && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            result.ok
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
        >
          {result.text}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50 sm:w-auto"
      >
        <Send className="h-4 w-4" />
        {sending ? "Enviando..." : "Enviar mensagem"}
      </button>
    </form>
  )
}
