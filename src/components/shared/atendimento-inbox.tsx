"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Check, Mail, MessageSquare, Phone, UserRound } from "lucide-react"

export interface AtendimentoMessage {
  id: string
  kind: "CONTACT" | "STUDENT_SUPPORT"
  status: "OPEN" | "RESOLVED"
  nome: string
  email: string | null
  telefone: string | null
  assunto: string | null
  mensagem: string
  studentId: string | null
  source: string | null
  createdAt: string
}

interface Props {
  messages: AtendimentoMessage[]
  // base do PATCH de resolucao (ex: "/api/admin/atendimento")
  apiBase: string
  // base do perfil do aluno (ex: "/admin/alunos" | "/painel/alunos")
  alunoBase: string
}

const KIND_LABEL: Record<AtendimentoMessage["kind"], string> = {
  CONTACT: "Contato",
  STUDENT_SUPPORT: "Suporte do aluno",
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AtendimentoInbox({ messages, apiBase, alunoBase }: Props) {
  const router = useRouter()
  const [resolving, setResolving] = useState<string | null>(null)

  async function resolve(id: string) {
    setResolving(id)
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      })
      if (!res.ok) {
        toast.error("Não foi possível marcar como resolvido.")
        return
      }
      toast.success("Marcado como resolvido.")
      router.refresh()
    } catch {
      toast.error("Falha de conexão. Tente de novo.")
    } finally {
      setResolving(null)
    }
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-[var(--color-pmb-green-900)]">
          Nenhuma mensagem por aqui
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          As mensagens enviadas pelo formulário de contato e pelo suporte dos
          alunos aparecem nesta caixa.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-50)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-pmb-green)]">
              {KIND_LABEL[m.kind]}
            </span>
            {m.status === "RESOLVED" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <Check className="h-3 w-3" /> Resolvido
              </span>
            )}
            <span className="ml-auto text-xs text-gray-500">
              {formatDate(m.createdAt)}
            </span>
          </div>

          <h3 className="mt-3 text-sm font-bold text-[var(--color-pmb-green-900)]">
            {m.assunto || "(sem assunto)"}
          </h3>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" /> {m.nome}
            </span>
            {m.email && (
              <a
                href={`mailto:${m.email}`}
                className="inline-flex items-center gap-1 hover:text-[var(--color-pmb-green)]"
              >
                <Mail className="h-3.5 w-3.5" /> {m.email}
              </a>
            )}
            {m.telefone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {m.telefone}
              </span>
            )}
          </div>

          <p className="mt-3 whitespace-pre-line text-sm text-gray-700">
            {m.mensagem}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {m.studentId && (
              <Link
                href={`${alunoBase}/${m.studentId}`}
                className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
              >
                Ver perfil do aluno →
              </Link>
            )}
            {m.status === "OPEN" && (
              <button
                type="button"
                onClick={() => resolve(m.id)}
                disabled={resolving === m.id}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[rgba(2,89,24,0.2)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-lime-50)] disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                {resolving === m.id ? "Salvando…" : "Marcar como resolvido"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
