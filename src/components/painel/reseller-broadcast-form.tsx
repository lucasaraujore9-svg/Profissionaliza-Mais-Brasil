"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react"

type Level = "INFO" | "SUCCESS" | "WARNING" | "ERROR"
type Scope = "ALL" | "ONE"

const LEVELS: Array<{ value: Level; label: string }> = [
  { value: "INFO", label: "Informativo" },
  { value: "SUCCESS", label: "Sucesso" },
  { value: "WARNING", label: "Aviso" },
  { value: "ERROR", label: "Crítico" },
]

interface StudentOption {
  id: string
  nome: string
  email: string | null
}

export function ResellerBroadcastForm() {
  const [scope, setScope] = useState<Scope>("ALL")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [href, setHref] = useState("")
  const [level, setLevel] = useState<Level>("INFO")

  const [studentQuery, setStudentQuery] = useState("")
  const [students, setStudents] = useState<StudentOption[]>([])
  const [studentLoading, setStudentLoading] = useState(false)
  const [studentId, setStudentId] = useState<string>("")

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { kind: "ok"; delivered: number }
    | { kind: "err"; message: string }
    | null
  >(null)

  useEffect(() => {
    if (scope !== "ONE") return
    const ctrl = new AbortController()
    setStudentLoading(true)
    fetch(`/api/painel/comunicacao/alunos?q=${encodeURIComponent(studentQuery)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        setStudents((j.data?.items ?? []) as StudentOption[])
      })
      .catch(() => {})
      .finally(() => setStudentLoading(false))
    return () => ctrl.abort()
  }, [studentQuery, scope])

  const canSubmit = useMemo(() => {
    if (!title.trim() || submitting) return false
    if (scope === "ONE" && !studentId) return false
    return true
  }, [title, submitting, scope, studentId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setResult(null)
    try {
      const payload = {
        title: title.trim(),
        body: body.trim() || undefined,
        href: href.trim() || undefined,
        level,
        scope,
        ...(scope === "ONE" ? { studentId } : {}),
      }
      const res = await fetch("/api/painel/comunicacao/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setResult({ kind: "err", message: json.error ?? "Falha ao enviar" })
        return
      }
      setResult({ kind: "ok", delivered: json.data?.delivered ?? 0 })
      setTitle("")
      setBody("")
      setHref("")
    } catch {
      setResult({ kind: "err", message: "Erro de rede" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <header>
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Comunicar com meus alunos
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Notificação aparece no app do aluno e dispara push para quem permitiu.
        </p>
      </header>

      <fieldset className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
          Destinatário
        </label>
        <div className="flex gap-2">
          <label
            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              scope === "ALL"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                : "border-gray-300 bg-white"
            }`}
          >
            <input
              type="radio"
              name="scope"
              checked={scope === "ALL"}
              onChange={() => {
                setScope("ALL")
                setStudentId("")
              }}
            />
            <span className="font-semibold">Todos os meus alunos</span>
          </label>
          <label
            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              scope === "ONE"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                : "border-gray-300 bg-white"
            }`}
          >
            <input
              type="radio"
              name="scope"
              checked={scope === "ONE"}
              onChange={() => setScope("ONE")}
            />
            <span className="font-semibold">Um aluno específico</span>
          </label>
        </div>
      </fieldset>

      {scope === "ONE" && (
        <fieldset className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Selecione o aluno
          </label>
          <input
            type="text"
            placeholder="Buscar por nome, email ou CPF..."
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
          <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
            {studentLoading ? (
              <p className="px-3 py-2 text-xs text-gray-500">Buscando...</p>
            ) : students.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">Nenhum aluno.</p>
            ) : (
              students.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${
                    studentId === s.id ? "bg-[var(--color-pmb-lime-50)]" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="student"
                    checked={studentId === s.id}
                    onChange={() => setStudentId(s.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--color-pmb-green-900)]">
                      {s.nome}
                    </div>
                    <div className="truncate text-gray-500">{s.email}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Título (obrigatório)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Nível
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
          Mensagem
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
        />
        <p className="text-[10px] text-gray-400">
          {body.length}/500 caracteres
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
          Link opcional
        </label>
        <input
          type="text"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="/aluno/cursos"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
        />
      </fieldset>

      {result?.kind === "ok" && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Enviado para {result.delivered}{" "}
          {result.delivered === 1 ? "aluno" : "alunos"}.
        </div>
      )}
      {result?.kind === "err" && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4" />
          {result.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Enviar
      </button>
    </form>
  )
}
