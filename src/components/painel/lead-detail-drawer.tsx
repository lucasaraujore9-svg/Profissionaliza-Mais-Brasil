"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Loader2,
  X,
  Mail,
  Phone,
  BookOpen,
  Send,
  Trash2,
  Activity,
  MessageCircle,
  GraduationCap,
  Footprints,
  FileText,
  UserRound,
} from "lucide-react"
import { STAGE_META, type StageKey } from "./lead-kanban-column"
import { LeadStageBadge } from "./lead-stage"

interface LeadActivity {
  id: string
  kind: string
  body: string | null
  metadata: unknown
  createdAt: string
}

interface CourseTimelineEntry {
  id: string
  courseName: string
  stage: StageKey
  paymentValue: number | null
  createdAt: string
}

interface NavigationEntry {
  id: string
  kind: "PAGE_VIEW" | "COURSE_VIEW"
  path: string
  title: string | null
  courseName: string | null
  referrer: string | null
  createdAt: string
}

interface LeadDetail {
  id: string
  nome: string
  email: string
  telefone: string
  notes: string | null
  stage: StageKey
  source: string
  ownerUserId: string | null
  paymentValue: number | null
  courseSnapshot: string | null
  course: { slug: string; nome: string } | null
  enrollment: { id: string; status: string; finalAmount: number } | null
  createdAt: string
  updatedAt: string
  courseTimeline: CourseTimelineEntry[]
  navigation: NavigationEntry[]
  activities: LeadActivity[]
}

const OUTCOME_LABEL: Record<StageKey, string> = {
  NEW: "Demonstrou interesse",
  CONTACTED: "Em contato",
  CHECKOUT_STARTED: "Iniciou o checkout",
  ABANDONED: "Abandonou o carrinho",
  WON: "Concluiu o pagamento",
  LOST: "Descartado",
}

interface LeadDetailDrawerProps {
  leadId: string | null
  apiBase?: string
  onClose: () => void
  onChanged: () => void
}

const ACTIVITY_KIND_LABEL: Record<string, string> = {
  STAGE_CHANGED: "Mudou de coluna",
  WA_MESSAGE_SENT: "Mensagem enviada",
  WA_MESSAGE_FAILED: "Falha no envio",
  NOTE: "Anotação",
  LEAD_CREATED: "Lead criado",
  ENROLLMENT_LINKED: "Checkout vinculado",
  PAYMENT_APPROVED: "Pagamento aprovado",
}

export function LeadDetailDrawer({
  leadId,
  apiBase = "/api/painel/leads",
  onClose,
  onChanged,
}: LeadDetailDrawerProps) {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState("")
  const [posting, setPosting] = useState(false)
  const [waMessage, setWaMessage] = useState("")
  const [waSending, setWaSending] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [assignees, setAssignees] = useState<{ userId: string; name: string; active: boolean }[]>([])
  const [savingOwner, setSavingOwner] = useState(false)

  // Seletor de responsável só existe no painel do revendedor (consultores).
  const supportsOwner = apiBase === "/api/painel/leads"

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!leadId) return
      // silent = atualizacao em background (polling): nao mostra spinner nem
      // toast de rede, para nao piscar a UI nem incomodar o operador.
      if (!opts?.silent) setLoading(true)
      try {
        const res = await fetch(`${apiBase}/${leadId}`, {
          cache: "no-store",
        })
        const body = await res.json()
        if (res.ok) {
          setLead(body.data)
        } else if (!opts?.silent) {
          toast.error(body.error ?? "Falha ao carregar lead")
        }
      } catch {
        if (!opts?.silent) toast.error("Erro de rede")
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [leadId, apiBase],
  )

  useEffect(() => {
    if (leadId) {
      load()
    } else {
      setLead(null)
      setNote("")
    }
    setWaMessage("")
    setWaError(null)
  }, [leadId, load])

  // Polling leve: enquanto o drawer esta aberto e a aba visivel, recarrega a
  // cada 12s para que novos page views (e mudancas de stage) aparecam na
  // timeline sem o operador precisar reabrir o lead.
  useEffect(() => {
    if (!leadId) return
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      void load({ silent: true })
    }, 12_000)
    return () => clearInterval(id)
  }, [leadId, load])

  // Carrega os consultores elegíveis uma vez (para o seletor de responsável).
  useEffect(() => {
    if (!supportsOwner || !leadId) return
    let cancelled = false
    fetch("/api/painel/leads/distribuicao", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.data?.members) return
        setAssignees(body.data.members)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [supportsOwner, leadId])

  async function changeOwner(ownerUserId: string | null) {
    if (!leadId) return
    setSavingOwner(true)
    try {
      const res = await fetch(`${apiBase}/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUserId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao alterar responsável")
        return
      }
      toast.success(ownerUserId ? "Responsável atualizado" : "Responsável removido")
      await load()
      onChanged()
    } catch {
      toast.error("Erro de rede")
    } finally {
      setSavingOwner(false)
    }
  }

  async function sendWhatsApp() {
    if (!leadId || !waMessage.trim()) return
    setWaSending(true)
    setWaError(null)
    try {
      const res = await fetch(`${apiBase}/${leadId}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: waMessage.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("Mensagem enviada pelo WhatsApp")
        setWaMessage("")
        await load()
        return
      }
      // Numero sem WhatsApp: mostra inline (esperado). Demais: toast.
      if (body.code === "no_whatsapp") {
        setWaError(body.error ?? "Este número não possui conta no WhatsApp.")
      } else {
        toast.error(body.error ?? "Falha ao enviar mensagem")
      }
    } catch {
      toast.error("Erro de rede")
    } finally {
      setWaSending(false)
    }
  }

  async function postNote() {
    if (!leadId || !note.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`${apiBase}/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar anotação")
        return
      }
      setNote("")
      await load()
    } catch {
      toast.error("Erro de rede")
    } finally {
      setPosting(false)
    }
  }

  async function discard() {
    if (!leadId) return
    if (!confirm("Descartar este lead? Vai para a coluna Perdidos.")) return
    try {
      const res = await fetch(`${apiBase}/${leadId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao descartar")
        return
      }
      toast.success("Lead movido para Perdidos")
      onChanged()
      onClose()
    } catch {
      toast.error("Erro de rede")
    }
  }

  if (!leadId) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="flex-1 bg-black/40"
      />
      <aside className="flex w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
            Detalhes do lead
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {loading && !lead && (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando…
          </div>
        )}

        {lead && (
          <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[var(--color-pmb-green-900)]">
                {lead.nome}
              </h3>
              <p className="flex items-center gap-2 text-gray-600">
                <Mail className="h-3.5 w-3.5" /> {lead.email}
              </p>
              <p className="flex items-center gap-2 text-gray-600">
                <Phone className="h-3.5 w-3.5" /> {lead.telefone}
              </p>
              {lead.courseSnapshot && (
                <p className="flex items-center gap-2 text-gray-600">
                  <BookOpen className="h-3.5 w-3.5" /> {lead.courseSnapshot}
                </p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <LeadStageBadge
                  stage={lead.stage}
                  label={STAGE_META[lead.stage].label}
                />
                <span className="text-[11px] text-gray-500">
                  Criado em {new Date(lead.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
              {lead.enrollment && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[12px]">
                  <p className="text-gray-700">
                    <strong>Matrícula:</strong> {lead.enrollment.status} ·{" "}
                    <span className="font-mono">
                      R$ {lead.enrollment.finalAmount.toFixed(2).replace(".", ",")}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {supportsOwner && (
              <div className="mt-5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <UserRound className="h-3.5 w-3.5" />
                  Responsável
                </label>
                <select
                  value={lead.ownerUserId ?? ""}
                  disabled={savingOwner}
                  onChange={(e) => changeOwner(e.target.value || null)}
                  className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[12.5px] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
                >
                  <option value="">Sem responsável (fila da unidade)</option>
                  {assignees.map((a) => (
                    <option key={a.userId} value={a.userId} disabled={!a.active}>
                      {a.name}
                      {!a.active ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
                {assignees.length === 0 && (
                  <p className="mt-1.5 text-[10.5px] text-gray-400">
                    Cadastre consultores na Equipe para atribuir leads.
                  </p>
                )}
              </div>
            )}

            {lead.courseTimeline.length > 0 && (
              <div className="mt-6">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Cursos visitados
                </h4>
                <ol className="mt-2 space-y-0">
                  {lead.courseTimeline.map((c, i) => (
                    <li key={c.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < lead.courseTimeline.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute left-[5px] top-3 h-full w-px bg-gray-200"
                        />
                      )}
                      <span
                        aria-hidden
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_META[c.stage].badge}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-pmb-green-900)]">
                          <span className="truncate">{c.courseName}</span>
                          {c.id === lead.id && (
                            <span className="shrink-0 rounded bg-[var(--color-pmb-mist)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-pmb-green-900)]">
                              Atual
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-600">
                          {OUTCOME_LABEL[c.stage]}
                          {c.stage === "WON" && c.paymentValue !== null && (
                            <span className="font-mono font-semibold text-[var(--color-pmb-green-700)]">
                              {" "}
                              · R$ {c.paymentValue.toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(c.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {lead.navigation.length > 0 && (
              <div className="mt-6">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <Footprints className="h-3.5 w-3.5" />
                  Navegação no site
                  <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">
                    {lead.navigation.length}
                  </span>
                </h4>
                <ol className="mt-2 space-y-0">
                  {lead.navigation.map((n, i) => (
                    <li key={n.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                      {i < lead.navigation.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute left-[7px] top-4 h-full w-px bg-gray-200"
                        />
                      )}
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--color-pmb-mist)] text-[var(--color-pmb-green-900)]"
                      >
                        {n.kind === "COURSE_VIEW" ? (
                          <BookOpen className="h-2.5 w-2.5" />
                        ) : (
                          <FileText className="h-2.5 w-2.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-[var(--color-pmb-green-900)]">
                          {n.courseName ?? n.title ?? n.path}
                        </p>
                        <p className="truncate text-[10.5px] text-gray-500">
                          {n.kind === "COURSE_VIEW" ? "Visitou o curso · " : "Visitou · "}
                          <span className="font-mono">{n.path}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(n.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="mt-6">
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <Activity className="h-3.5 w-3.5" />
                Histórico
              </h4>
              <ul className="mt-2 space-y-2">
                {lead.activities.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-gray-200 bg-white p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--color-pmb-green-900)]">
                        {ACTIVITY_KIND_LABEL[a.kind] ?? a.kind}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {a.body && (
                      <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-gray-700">
                        {a.body}
                      </p>
                    )}
                  </li>
                ))}
                {lead.activities.length === 0 && (
                  <li className="text-[11px] text-gray-400">Sem atividades</li>
                )}
              </ul>
            </div>

            <div className="mt-6">
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <MessageCircle className="h-3.5 w-3.5" />
                Enviar WhatsApp
              </h4>
              <textarea
                value={waMessage}
                onChange={(e) => {
                  setWaMessage(e.target.value)
                  if (waError) setWaError(null)
                }}
                placeholder="Escreva uma mensagem para o WhatsApp do lead…"
                rows={3}
                className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[12.5px] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
              />
              {waError && (
                <p className="mt-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11.5px] font-medium text-rose-700">
                  {waError}
                </p>
              )}
              <button
                onClick={sendWhatsApp}
                disabled={waSending || !waMessage.trim()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1ebe5b] disabled:opacity-50"
              >
                {waSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                Enviar WhatsApp
              </button>
              <p className="mt-1.5 text-[10px] text-gray-400">
                Verificamos se o número tem conta no WhatsApp antes de enviar.
              </p>
            </div>

            <div className="mt-6">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Anotação
              </h4>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Escreva uma anotação para o histórico…"
                rows={3}
                className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[12.5px] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
              />
              <button
                onClick={postNote}
                disabled={posting || !note.trim()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pmb-green)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
              >
                {posting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Salvar anotação
              </button>
            </div>
          </div>
        )}

        {lead && (
          <footer className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
            <button
              onClick={discard}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar lead
            </button>
            <span className="font-mono text-[10px] text-gray-400">ID: {lead.id}</span>
          </footer>
        )}
      </aside>
    </div>
  )
}
