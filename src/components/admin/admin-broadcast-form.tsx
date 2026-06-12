"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react"
import { clientLogger } from "@/lib/logger-client"

type Level = "INFO" | "SUCCESS" | "WARNING" | "ERROR"

type AudienceMode =
  | "tenant-all"
  | "tenant-one"
  | "student-pmb"
  | "student-tenant"
  | "student-all"
  | "student-one"
  | "visitor-all"
  | "visitor-pmb"
  | "visitor-tenant"

const AUDIENCE_LABEL: Record<AudienceMode, string> = {
  "tenant-all": "Todas as unidades (painel da revenda)",
  "tenant-one": "Uma unidade específica (painel da revenda)",
  "student-pmb": "Apenas meus alunos PMB (vitrine direta)",
  "student-tenant": "Alunos de uma unidade específica",
  "student-all": "Todos os alunos do ecossistema",
  "student-one": "Um aluno específico",
  "visitor-all": "Todos os visitantes do site (anônimos)",
  "visitor-pmb": "Visitantes do site institucional PMB",
  "visitor-tenant": "Visitantes de uma unidade específica",
}

const LEVELS: Array<{ value: Level; label: string }> = [
  { value: "INFO", label: "Informativo" },
  { value: "SUCCESS", label: "Sucesso" },
  { value: "WARNING", label: "Aviso" },
  { value: "ERROR", label: "Crítico" },
]

interface TenantOption {
  id: string
  name: string
  slug: string
}
interface StudentOption {
  id: string
  nome: string
  email: string | null
  tenant?: { name: string } | null
}

export function AdminBroadcastForm() {
  const [mode, setMode] = useState<AudienceMode>("tenant-all")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [href, setHref] = useState("")
  const [level, setLevel] = useState<Level>("INFO")

  const [tenantQuery, setTenantQuery] = useState("")
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantLoading, setTenantLoading] = useState(false)
  const [tenantId, setTenantId] = useState<string>("")

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

  const needsTenant =
    mode === "tenant-one" ||
    mode === "student-tenant" ||
    mode === "visitor-tenant"
  const needsStudent = mode === "student-one"
  const isVisitor = mode.startsWith("visitor-")

  // busca de unidades
  useEffect(() => {
    if (!needsTenant) return
    const ctrl = new AbortController()
    setTenantLoading(true)
    fetch(`/api/admin/revendedores?q=${encodeURIComponent(tenantQuery)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        const items: TenantOption[] = (j.data?.items ?? j.items ?? []).map(
          (t: { id: string; name: string; slug: string }) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
          }),
        )
        setTenants(items)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        clientLogger.warn(
          { err: String(err), event: "admin_broadcast.tenant_fetch_failed" },
          "busca de tenants falhou",
        )
      })
      .finally(() => setTenantLoading(false))
    return () => ctrl.abort()
  }, [tenantQuery, needsTenant])

  // busca de alunos
  useEffect(() => {
    if (!needsStudent) return
    const ctrl = new AbortController()
    setStudentLoading(true)
    fetch(`/api/admin/alunos/global?q=${encodeURIComponent(studentQuery)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        const items: StudentOption[] = (j.data?.items ?? j.items ?? []).map(
          (s: {
            id: string
            nome: string
            email: string | null
            tenant?: { name?: string } | null
          }) => ({
            id: s.id,
            nome: s.nome,
            email: s.email,
            tenant: s.tenant?.name ? { name: s.tenant.name } : null,
          }),
        )
        setStudents(items)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        clientLogger.warn(
          { err: String(err), event: "admin_broadcast.student_fetch_failed" },
          "busca de alunos falhou",
        )
      })
      .finally(() => setStudentLoading(false))
    return () => ctrl.abort()
  }, [studentQuery, needsStudent])

  const canSubmit = useMemo(() => {
    if (!title.trim() || submitting) return false
    if (needsTenant && !tenantId) return false
    if (needsStudent && !studentId) return false
    return true
  }, [title, submitting, needsTenant, needsStudent, tenantId, studentId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setResult(null)
    try {
      const payload = buildPayload({
        mode,
        title,
        body,
        href,
        level,
        tenantId,
        studentId,
      })
      const res = await fetch("/api/admin/notifications/broadcast", {
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
    } catch (err) {
      clientLogger.error(
        { err: String(err), event: "admin_broadcast.submit_failed" },
        "envio de broadcast (admin) falhou",
      )
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
          Disparar comunicação
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Envia notificação in-app + push para o destinatário escolhido.
        </p>
      </header>

      <fieldset className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
          Destinatário
        </label>
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as AudienceMode)
            setTenantId("")
            setStudentId("")
            setResult(null)
          }}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
        >
          <optgroup label="Unidades">
            <option value="tenant-all">{AUDIENCE_LABEL["tenant-all"]}</option>
            <option value="tenant-one">{AUDIENCE_LABEL["tenant-one"]}</option>
          </optgroup>
          <optgroup label="Alunos">
            <option value="student-pmb">{AUDIENCE_LABEL["student-pmb"]}</option>
            <option value="student-tenant">
              {AUDIENCE_LABEL["student-tenant"]}
            </option>
            <option value="student-all">{AUDIENCE_LABEL["student-all"]}</option>
            <option value="student-one">{AUDIENCE_LABEL["student-one"]}</option>
          </optgroup>
          <optgroup label="Visitantes do site (anônimos)">
            <option value="visitor-all">{AUDIENCE_LABEL["visitor-all"]}</option>
            <option value="visitor-pmb">{AUDIENCE_LABEL["visitor-pmb"]}</option>
            <option value="visitor-tenant">
              {AUDIENCE_LABEL["visitor-tenant"]}
            </option>
          </optgroup>
        </select>
        {isVisitor && (
          <p className="text-[11px] leading-relaxed text-amber-700">
            Envio <strong>somente push</strong> (visitantes anônimos não têm
            feed in-app). Só recebem quem ativou as notificações pelo banner do
            site.
          </p>
        )}
      </fieldset>

      {needsTenant && (
        <fieldset className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Selecione a unidade
          </label>
          <input
            type="text"
            placeholder="Buscar por nome ou slug..."
            value={tenantQuery}
            onChange={(e) => setTenantQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
          <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
            {tenantLoading ? (
              <p className="px-3 py-2 text-xs text-gray-500">Buscando...</p>
            ) : tenants.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">Nenhum resultado.</p>
            ) : (
              tenants.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${
                    tenantId === t.id ? "bg-[var(--color-pmb-lime-50)]" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="tenant"
                    checked={tenantId === t.id}
                    onChange={() => setTenantId(t.id)}
                  />
                  <span className="font-semibold text-[var(--color-pmb-green-900)]">
                    {t.name}
                  </span>
                  <span className="text-gray-500">/{t.slug}</span>
                </label>
              ))
            )}
          </div>
        </fieldset>
      )}

      {needsStudent && (
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
              <p className="px-3 py-2 text-xs text-gray-500">Nenhum resultado.</p>
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
                    <div className="truncate text-gray-500">
                      {s.email}
                      {s.tenant?.name ? ` · ${s.tenant.name}` : ""}
                    </div>
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
          Link opcional (rota interna ou URL)
        </label>
        <input
          type="text"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="/painel/financeiro"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
        />
      </fieldset>

      {result?.kind === "ok" && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Enviado. Entregue para {result.delivered}{" "}
          {result.delivered === 1 ? "destinatário" : "destinatários"}.
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

interface BuildArgs {
  mode: AudienceMode
  title: string
  body: string
  href: string
  level: Level
  tenantId: string
  studentId: string
}

function buildPayload(a: BuildArgs) {
  const common = {
    title: a.title.trim(),
    body: a.body.trim() || undefined,
    href: a.href.trim() || undefined,
    level: a.level,
  }
  switch (a.mode) {
    case "tenant-all":
      return { ...common, target: "TENANT", scope: "ALL" }
    case "tenant-one":
      return { ...common, target: "TENANT", scope: "ONE", tenantId: a.tenantId }
    case "student-pmb":
      return { ...common, target: "STUDENT", scope: "PMB" }
    case "student-tenant":
      return {
        ...common,
        target: "STUDENT",
        scope: "TENANT",
        tenantId: a.tenantId,
      }
    case "student-all":
      return { ...common, target: "STUDENT", scope: "ALL" }
    case "student-one":
      return {
        ...common,
        target: "STUDENT",
        scope: "ONE",
        studentId: a.studentId,
      }
    case "visitor-all":
      return { ...common, target: "VISITOR", scope: "ALL" }
    case "visitor-pmb":
      return { ...common, target: "VISITOR", scope: "PMB" }
    case "visitor-tenant":
      return {
        ...common,
        target: "VISITOR",
        scope: "TENANT",
        tenantId: a.tenantId,
      }
  }
}
