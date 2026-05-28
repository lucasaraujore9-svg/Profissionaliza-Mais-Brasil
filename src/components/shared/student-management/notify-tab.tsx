"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Send } from "lucide-react"
import type { ManagementScope, StudentNotificationItem } from "./types"
import { apiBase } from "./types"

type Level = "INFO" | "SUCCESS" | "WARNING" | "ERROR"

const LEVEL_LABEL: Record<Level, string> = {
  INFO: "Informação",
  SUCCESS: "Sucesso",
  WARNING: "Atenção",
  ERROR: "Alerta",
}

const LEVEL_CLASS: Record<Level, string> = {
  INFO: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  WARNING: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  ERROR: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
}

export function NotifyTab({
  studentId,
  initialNotifications,
  scope,
}: {
  studentId: string
  initialNotifications: StudentNotificationItem[]
  scope: ManagementScope
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [href, setHref] = useState("")
  const [level, setLevel] = useState<Level>("INFO")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const [list, setList] = useState<StudentNotificationItem[]>(
    initialNotifications,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await fetch(`${apiBase(scope, studentId)}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || undefined,
          href: href.trim() || undefined,
          level,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? "Falha ao enviar" })
      } else {
        setResult({ ok: true, text: "Notificação enviada para o aluno." })
        if (data.notification) {
          setList((prev) => [
            data.notification as StudentNotificationItem,
            ...prev,
          ])
        }
        setTitle("")
        setBody("")
        setHref("")
        setLevel("INFO")
        router.refresh()
      }
    } catch {
      setResult({ ok: false, text: "Erro de rede" })
    } finally {
      setSending(false)
    }
  }

  const disabled = sending || title.trim().length < 3

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Enviar notificação ao aluno
          </h2>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          A notificação aparece no sino do aluno em <code>/aluno</code> e dispara
          push se ele tiver habilitado.
        </p>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-700">
                Título <span className="text-rose-500">*</span>
              </span>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Sua mensalidade vence amanhã"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Nível</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className="mt-1 h-[38px] w-full rounded-md border border-gray-200 px-3 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
              >
                {Object.entries(LEVEL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Mensagem</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Detalhes da notificação (opcional)..."
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Link de ação (opcional)
            </span>
            <input
              type="text"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              maxLength={300}
              placeholder="/aluno/pagamentos"
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
            />
            <span className="mt-1 block text-[10px] text-gray-500">
              Onde o aluno vai ao clicar na notificação.
            </span>
          </label>

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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? "Enviando..." : "Enviar notificação"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Notificações recentes ({list.length})
          </h2>
        </header>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Nenhuma notificação enviada ainda.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_CLASS[(n.level as Level) ?? "INFO"]}`}
                    >
                      {LEVEL_LABEL[(n.level as Level) ?? "INFO"]}
                    </span>
                    <p className="text-sm font-medium text-[var(--color-pmb-green-900)]">
                      {n.title}
                    </p>
                  </div>
                  {n.body && (
                    <p className="mt-1 text-xs text-gray-600">{n.body}</p>
                  )}
                </div>
                <div className="text-right text-[10px] text-gray-500">
                  <p>{new Date(n.createdAt).toLocaleString("pt-BR")}</p>
                  {n.readAt && (
                    <p className="mt-0.5 text-emerald-600">Lida</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
