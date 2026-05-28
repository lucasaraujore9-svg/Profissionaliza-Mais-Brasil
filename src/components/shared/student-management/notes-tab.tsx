"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, MessageSquare } from "lucide-react"
import type { ManagementScope, StudentNoteItem } from "./types"
import { apiBase } from "./types"

export function NotesTab({
  studentId,
  initialNotes,
  scope,
  currentUserId,
}: {
  studentId: string
  initialNotes: StudentNoteItem[]
  scope: ManagementScope
  currentUserId: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState<StudentNoteItem[]>(initialNotes)
  const [body, setBody] = useState("")
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (body.trim().length < 3) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase(scope, studentId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Falha ao adicionar nota")
      } else {
        setNotes((prev) => [data.note as StudentNoteItem, ...prev])
        setBody("")
        router.refresh()
      }
    } catch {
      setError("Erro de rede")
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(noteId: string) {
    if (!confirm("Apagar esta nota?")) return
    setDeletingId(noteId)
    try {
      const res = await fetch(
        `${apiBase(scope, studentId)}/notes?noteId=${noteId}`,
        { method: "DELETE" },
      )
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId))
        router.refresh()
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Nova nota interna
          </h2>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Anotações visíveis apenas para a equipe do sistema. O aluno nunca vê.
        </p>
        <form onSubmit={handleAdd} className="mt-3 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anote algo relevante sobre o aluno..."
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
          />
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={posting || body.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {posting ? "Salvando..." : "Adicionar nota"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Histórico ({notes.length})
          </h2>
        </header>
        {notes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Nenhuma nota ainda.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notes.map((n) => {
              const isMine = n.authorId === currentUserId
              const isDeleting = deletingId === n.id
              return (
                <li key={n.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
                        {n.authorName}
                        <span className="ml-2 font-normal text-gray-500">
                          {new Date(n.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                        {n.body}
                      </p>
                    </div>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => handleDelete(n.id)}
                        disabled={isDeleting}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        title="Apagar nota"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
