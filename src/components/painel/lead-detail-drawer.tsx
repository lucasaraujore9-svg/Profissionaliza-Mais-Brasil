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
} from "lucide-react"
import { STAGE_META, type StageKey } from "./lead-kanban-column"

interface LeadActivity {
  id: string
  kind: string
  body: string | null
  metadata: unknown
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
  paymentValue: number | null
  courseSnapshot: string | null
  course: { slug: string; nome: string } | null
  enrollment: { id: string; status: string; finalAmount: number } | null
  createdAt: string
  updatedAt: string
  activities: LeadActivity[]
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

  const load = useCallback(async () => {
    if (!leadId) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/${leadId}`, {
        cache: "no-store",
      })
      const body = await res.json()
      if (res.ok) {
        setLead(body.data)
      } else {
        toast.error(body.error ?? "Falha ao carregar lead")
      }
    } catch {
      toast.error("Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (leadId) {
      load()
    } else {
      setLead(null)
      setNote("")
    }
  }, [leadId, load])

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
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    STAGE_META[lead.stage].badge
                  }`}
                >
                  {STAGE_META[lead.stage].label}
                </span>
                <span className="text-[11px] text-gray-500">
                  Criado em {new Date(lead.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
              {lead.enrollment && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[12px]">
                  <p className="text-gray-700">
                    <strong>Matrícula:</strong> {lead.enrollment.status} ·{" "}
                    R$ {lead.enrollment.finalAmount.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}
            </div>

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
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar lead
            </button>
            <span className="text-[10px] text-gray-400">ID: {lead.id}</span>
          </footer>
        )}
      </aside>
    </div>
  )
}
