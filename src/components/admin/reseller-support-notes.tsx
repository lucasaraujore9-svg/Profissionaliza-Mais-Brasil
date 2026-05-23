"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { MessageCircle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface Note {
  id: string
  body: string
  author: string
  createdAt: string
}

export function ResellerSupportNotes({
  tenantId,
  whatsapp,
}: {
  tenantId: string
  whatsapp?: string | null
}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/revendedores/${tenantId}/notes`)
    if (!res.ok) return
    const json = await res.json()
    setNotes(json.data ?? [])
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  async function submit() {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      })
      if (!res.ok) {
        toast.error("Falha ao salvar nota")
        return
      }
      const json = await res.json()
      setNotes([json.data, ...notes])
      setBody("")
    } finally {
      setSending(false)
    }
  }

  const waLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Sou da equipe Profissionaliza Mais Brasil.")}`
    : null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-[var(--color-pmb-green-900)]">
          Suporte & Notas internas
        </h3>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Anote acompanhamentos, reuniões ou ocorrências…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            disabled={sending || !body.trim()}
            className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {sending ? "Salvando…" : "Adicionar nota"}
          </Button>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {notes.length === 0 && (
          <li className="text-xs text-gray-400 italic">Nenhuma nota ainda.</li>
        )}
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-500">
              {n.author} · {new Date(n.createdAt).toLocaleString("pt-BR")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
